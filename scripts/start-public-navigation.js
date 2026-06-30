const fs = require('fs');
const https = require('https');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output');
const DIST_DIR = path.join(ROOT, 'dist');
const TOOLS_DIR = path.join(ROOT, 'tools');
const PID_FILE = path.join(OUTPUT_DIR, 'public-navigation-pids.json');
const DEFAULT_PORT = 5174;
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const CLOUDFLARED_DOWNLOAD_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

const args = new Set(process.argv.slice(2));
const shouldStop = args.has('--stop');
const noBuild = args.has('--no-build') || args.has('-NoBuild');
const allowPinggy = args.has('--allow-pinggy');
const portArg = process.argv.find((arg) => arg.startsWith('--port='));
const port = portArg ? Number(portArg.slice('--port='.length)) : DEFAULT_PORT;

function log(message) {
  console.log(`[public-nav] ${message}`);
}

function commandName(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function terminateProcess(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(pid);
    }
    log(`Stopped process #${pid}`);
  } catch (error) {
    log(`Process #${pid} is not running.`);
  }
}

function stopRecordedProcesses({ quiet = false } = {}) {
  if (!fs.existsSync(PID_FILE)) {
    if (!quiet) log('No previous public navigation process record found.');
    return;
  }
  const state = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
  for (const pid of [state.httpServerPid, state.tunnelPid]) {
    terminateProcess(pid);
  }
  fs.rmSync(PID_FILE, { force: true });
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(' ')} failed`);
  }
}

function isPortListening(portNumber) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: portNumber });
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitForPort(portNumber, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortListening(portNumber)) return true;
    await delay(500);
  }
  return false;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function removeIfExists(filePath) {
  fs.rmSync(filePath, { force: true });
}

function spawnDetached(command, commandArgs, outLog, errLog) {
  removeIfExists(outLog);
  removeIfExists(errLog);
  const out = fs.openSync(outLog, 'a');
  const err = fs.openSync(errLog, 'a');
  const child = spawn(command, commandArgs, {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', out, err],
    windowsHide: true
  });
  child.unref();
  return child;
}

function copyDxfFilesToDist() {
  const dxfFiles = fs.readdirSync(ROOT).filter((name) => name.toLowerCase().endsWith('.dxf'));
  if (!dxfFiles.length) throw new Error('No .dxf file found in project root.');
  for (const name of dxfFiles) {
    const source = path.join(ROOT, name);
    const target = path.join(DIST_DIR, name);
    if (fs.existsSync(target)) {
      const sourceStat = fs.statSync(source);
      const targetStat = fs.statSync(target);
      if (sourceStat.size === targetStat.size) continue;
    }
    fs.copyFileSync(source, target);
  }
  log(`Copied ${dxfFiles.length} DXF file(s) into dist.`);
}

function downloadFile(url, targetPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error(`Too many redirects while downloading ${url}`));
      return;
    }

    const request = https.get(url, {
      headers: {
        'User-Agent': 'gaode-public-navigation-script'
      }
    }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        const nextUrl = new URL(response.headers.location, url).toString();
        downloadFile(nextUrl, targetPath, redirectCount + 1).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${response.statusCode}`));
        return;
      }

      const tempPath = `${targetPath}.download`;
      const file = fs.createWriteStream(tempPath);
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          const stat = fs.statSync(tempPath);
          if (stat.size < 1024 * 1024) {
            fs.rmSync(tempPath, { force: true });
            reject(new Error('Downloaded cloudflared file is unexpectedly small.'));
            return;
          }
          fs.renameSync(tempPath, targetPath);
          resolve();
        });
      });
      file.on('error', reject);
    });

    request.setTimeout(120000, () => {
      request.destroy(new Error('Download timed out.'));
    });
    request.on('error', reject);
  });
}

async function ensureCloudflared() {
  const localCloudflared = path.join(TOOLS_DIR, 'cloudflared.exe');
  const candidates = [
    path.join(ROOT, 'cloudflared-windows-amd64.exe'),
    path.join(ROOT, 'cloudflared.exe'),
    localCloudflared,
    'cloudflared'
  ];
  const existing = candidates.find((candidate) => {
    if (candidate === 'cloudflared') {
      const checker = process.platform === 'win32' ? 'where.exe' : 'which';
      const result = spawnSync(checker, [candidate], { stdio: 'ignore' });
      return result.status === 0;
    }
    return fs.existsSync(candidate);
  });
  if (existing) return existing;

  if (process.platform !== 'win32') {
    throw new Error('cloudflared was not found. Install cloudflared or put it in this project root.');
  }

  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  log('cloudflared not found; downloading Cloudflare Quick Tunnel client...');
  await downloadFile(CLOUDFLARED_DOWNLOAD_URL, localCloudflared);
  log(`Downloaded cloudflared: ${localCloudflared}`);
  return localCloudflared;
}

async function waitForTunnelUrl(logPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const pattern = /https:\/\/[a-z0-9-]+\.(?:run\.pinggy-free\.link|free\.pinggy\.net)/g;
  while (Date.now() < deadline) {
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8');
      const matches = [...content.matchAll(pattern)].map((match) => match[0]);
      if (matches.length) return matches[matches.length - 1];
    }
    await delay(800);
  }
  throw new Error(`Timed out waiting for Pinggy public URL. Check log: ${logPath}`);
}

async function waitForCloudflareUrl(logPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const pattern = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/g;
  while (Date.now() < deadline) {
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8');
      const matches = [...content.matchAll(pattern)].map((match) => match[0]);
      if (matches.length) return matches[matches.length - 1];
      if (/429 Too Many Requests|error code: 1015/i.test(content)) {
        throw new Error('Cloudflare Quick Tunnel is currently rate limited.');
      }
    }
    await delay(800);
  }
  throw new Error(`Timed out waiting for Cloudflare public URL. Check log: ${logPath}`);
}

async function startCloudflareTunnel(portNumber) {
  const cloudflared = await ensureCloudflared();

  const tunnelOut = path.join(OUTPUT_DIR, `public-nav-cloudflare-${RUN_ID}.out.log`);
  const tunnelErr = path.join(OUTPUT_DIR, `public-nav-cloudflare-${RUN_ID}.err.log`);
  log('Starting Cloudflare Quick Tunnel...');
  const tunnel = spawnDetached(cloudflared, [
    'tunnel',
    '--url',
    `http://127.0.0.1:${portNumber}`,
    '--logfile',
    tunnelOut
  ], tunnelOut, tunnelErr);
  const publicBaseUrl = await waitForCloudflareUrl(tunnelOut, 45000);
  return {
    provider: 'cloudflare',
    process: tunnel,
    publicBaseUrl,
    note: 'Cloudflare Quick Tunnel has no browser warning page.'
  };
}

async function startPinggyTunnel(portNumber) {
  const tunnelOut = path.join(OUTPUT_DIR, `public-nav-pinggy-${RUN_ID}.out.log`);
  const tunnelErr = path.join(OUTPUT_DIR, `public-nav-pinggy-${RUN_ID}.err.log`);
  log('Starting Pinggy free public HTTPS tunnel...');
  const tunnel = spawnDetached('ssh.exe', [
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'ServerAliveInterval=60',
    '-p',
    '443',
    `-R0:127.0.0.1:${portNumber}`,
    'a.pinggy.io'
  ], tunnelOut, tunnelErr);
  const publicBaseUrl = await waitForTunnelUrl(tunnelOut, 45000);
  return {
    provider: 'pinggy',
    process: tunnel,
    publicBaseUrl,
    note: 'Pinggy free tunnel shows a browser warning page before the site.'
  };
}

async function main() {
  ensureOutputDir();

  if (shouldStop) {
    stopRecordedProcesses();
    return;
  }

  stopRecordedProcesses({ quiet: true });

  if (!noBuild) {
    log('Building frontend...');
    run(commandName('npm'), ['run', 'build']);
  }

  if (!fs.existsSync(DIST_DIR)) {
    throw new Error('dist directory does not exist. Build the project first.');
  }
  copyDxfFilesToDist();

  let httpServerPid = null;
  if (await isPortListening(port)) {
    log(`Local port ${port} is already listening; reusing existing static server.`);
  } else {
    const httpOut = path.join(OUTPUT_DIR, `public-nav-http-${RUN_ID}.out.log`);
    const httpErr = path.join(OUTPUT_DIR, `public-nav-http-${RUN_ID}.err.log`);
    log(`Starting local static server: http://127.0.0.1:${port}/navigation.html`);
    const httpServer = spawnDetached(commandName('npx'), [
      '-y',
      'http-server',
      'dist',
      '-a',
      '127.0.0.1',
      '-p',
      String(port),
      '-c-1'
    ], httpOut, httpErr);
    httpServerPid = httpServer.pid;
    if (!(await waitForPort(port, 25000))) {
      throw new Error(`Local static server failed to start. Check log: ${httpErr}`);
    }
  }

  let tunnelInfo = null;
  try {
    tunnelInfo = await startCloudflareTunnel(port);
  } catch (error) {
    log(error.message);
  }
  if (!tunnelInfo) {
    if (!allowPinggy) {
      throw new Error('Cloudflare tunnel failed. Pinggy fallback is disabled because it shows a browser warning page. Use --allow-pinggy only if you accept that limitation.');
    }
    tunnelInfo = await startPinggyTunnel(port);
  }

  const publicBaseUrl = tunnelInfo.publicBaseUrl;
  const navigationUrl = `${publicBaseUrl}/navigation.html`;
  const state = {
    startedAt: new Date().toISOString(),
    port,
    httpServerPid,
    tunnelProvider: tunnelInfo.provider,
    tunnelPid: tunnelInfo.process.pid,
    publicBaseUrl,
    navigationUrl,
    expires: tunnelInfo.provider === 'pinggy' ? 'Pinggy free tunnel usually expires in about 60 minutes' : 'Cloudflare Quick Tunnel is temporary',
    note: tunnelInfo.note
  };
  fs.writeFileSync(PID_FILE, JSON.stringify(state, null, 2), 'utf8');

  console.log('');
  console.log('Public navigation URL:');
  console.log(navigationUrl);
  console.log(`Provider: ${tunnelInfo.provider}`);
  console.log(tunnelInfo.note);
  console.log('');
  console.log('Keep this computer awake. Stop command: npm run public:nav:stop');
}

main().catch((error) => {
  console.error(`[public-nav] ${error.message}`);
  process.exit(1);
});
