const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output');
const DIST_DIR = path.join(ROOT, 'dist');
const PID_FILE = path.join(OUTPUT_DIR, 'public-navigation-pids.json');
const DEFAULT_PORT = 5174;
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

const args = new Set(process.argv.slice(2));
const shouldStop = args.has('--stop');
const noBuild = args.has('--no-build') || args.has('-NoBuild');
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

function stopRecordedProcesses() {
  if (!fs.existsSync(PID_FILE)) {
    log('No previous public navigation process record found.');
    return;
  }
  const state = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
  for (const pid of [state.httpServerPid, state.tunnelPid]) {
    if (!pid) continue;
    try {
      process.kill(pid);
      log(`Stopped process #${pid}`);
    } catch (error) {
      log(`Process #${pid} is not running.`);
    }
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

async function main() {
  ensureOutputDir();

  if (shouldStop) {
    stopRecordedProcesses();
    return;
  }

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
    `-R0:127.0.0.1:${port}`,
    'a.pinggy.io'
  ], tunnelOut, tunnelErr);

  const publicBaseUrl = await waitForTunnelUrl(tunnelOut, 45000);
  const navigationUrl = `${publicBaseUrl}/navigation.html`;
  const state = {
    startedAt: new Date().toISOString(),
    port,
    httpServerPid,
    tunnelPid: tunnel.pid,
    publicBaseUrl,
    navigationUrl,
    expires: 'Pinggy free tunnel usually expires in about 60 minutes'
  };
  fs.writeFileSync(PID_FILE, JSON.stringify(state, null, 2), 'utf8');

  console.log('');
  console.log('Public navigation URL:');
  console.log(navigationUrl);
  console.log('');
  console.log('Keep this computer awake. Stop command: npm run public:nav:stop');
}

main().catch((error) => {
  console.error(`[public-nav] ${error.message}`);
  process.exit(1);
});
