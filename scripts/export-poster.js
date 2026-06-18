const fs = require('fs');
const http = require('http');
const path = require('path');
require('dotenv').config();
const { chromium } = require('playwright');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = path.join(ROOT_DIR, 'exports', 'poster-8k.png');
const EXPORT_ACCELERATION_MODES = ['auto', 'gpu', 'software'];
const EXPORT_ASPECT_RATIOS = ['16:9', '4:3'];
const DEFAULT_EXPORT_SETTLE = 2000;
const EXPORT_WARNING_PIXELS = 30000000;
const EXPORT_MAX_PIXELS = 90000000;
const DEFAULT_SOURCE_VIEWPORT = { width: 1920, height: 1080 };

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.dxf': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8'
};

async function createViteDevServer() {
  const { createServer } = await import('vite');
  return createServer({
    configFile: false,
    root: ROOT_DIR,
    server: {
      middlewareMode: true,
      hmr: false
    },
    appType: 'custom'
  });
}

async function serveViteHtml(vite, request, response) {
  try {
    const htmlPath = path.join(ROOT_DIR, 'map3d.html');
    const source = await fs.promises.readFile(htmlPath, 'utf8');
    const html = await vite.transformIndexHtml(request.url, source);
    response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    response.end(html);
  } catch (error) {
    vite.ssrFixStacktrace(error);
    console.error(error);
    response.writeHead(500);
    response.end(error.message);
  }
}

function parseArgs(argv) {
  const options = {
    width: 5000,
    height: 2813,
    aspectRatio: '16:9',
    scale: 1,
    wait: 90000,
    settle: DEFAULT_EXPORT_SETTLE,
    acceleration: 'gpu',
    output: DEFAULT_OUTPUT,
    path: '/map3d.html?poster=1',
    headed: false,
    sourceWidth: DEFAULT_SOURCE_VIEWPORT.width,
    sourceHeight: DEFAULT_SOURCE_VIEWPORT.height
  };

  argv.forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const [key, value = ''] = arg.slice(2).split('=');
    if (key === 'width') options.width = Number(value);
    if (key === 'height') options.height = Number(value);
    if (key === 'aspect-ratio' || key === 'aspectRatio') options.aspectRatio = value;
    if (key === 'scale') options.scale = Number(value);
    if (key === 'wait') options.wait = Number(value);
    if (key === 'settle') options.settle = Number(value);
    if (key === 'acceleration') options.acceleration = value;
    if (key === 'output') options.output = path.resolve(ROOT_DIR, value);
    if (key === 'path') options.path = value.startsWith('/') ? value : '/' + value;
    if (key === 'headed') options.headed = value !== 'false';
    if (key === 'source-width' || key === 'sourceWidth') options.sourceWidth = Number(value);
    if (key === 'source-height' || key === 'sourceHeight') options.sourceHeight = Number(value);
  });

  if (!Number.isFinite(options.width) || options.width < 320 || options.width > 12000) throw new Error('Invalid --width');
  if (!EXPORT_ASPECT_RATIOS.includes(options.aspectRatio)) throw new Error('Invalid --aspect-ratio');
  options.width = Math.round(options.width);
  options.height = getExportHeightForRatio(options.width, options.aspectRatio);
  if (!Number.isFinite(options.height) || options.height < 240 || options.height > 10000) throw new Error('Invalid --height');
  if (!Number.isFinite(options.scale) || options.scale < 1 || options.scale > 8) throw new Error('Invalid --scale');
  if (!Number.isFinite(options.wait) || options.wait < 5000 || options.wait > 240000) throw new Error('Invalid --wait');
  if (!Number.isFinite(options.settle) || options.settle < 0 || options.settle > 180000) throw new Error('Invalid --settle');
  if (!EXPORT_ACCELERATION_MODES.includes(options.acceleration)) throw new Error('Invalid --acceleration');
  if (!Number.isFinite(options.sourceWidth) || options.sourceWidth < 1 || options.sourceWidth > 10000) throw new Error('Invalid --source-width');
  if (!Number.isFinite(options.sourceHeight) || options.sourceHeight < 1 || options.sourceHeight > 10000) throw new Error('Invalid --source-height');
  options.height = Math.round(options.height);
  options.settle = Math.round(options.settle);
  options.wait = Math.round(options.wait);
  options.sourceViewport = {
    width: Math.round(options.sourceWidth),
    height: Math.round(options.sourceHeight)
  };
  options.renderViewport = getRenderViewport(options.sourceViewport, options.aspectRatio);
  options.pixelWidth = Math.round(options.width * options.scale);
  options.pixelHeight = Math.round(options.height * options.scale);
  options.deviceScaleFactor = getDeviceScaleFactor(options.pixelWidth, options.renderViewport);
  options.pixelCount = options.pixelWidth * options.pixelHeight;
  if (options.pixelCount > EXPORT_MAX_PIXELS) {
    throw new Error(
      `Export pixels ${formatPixelCount(options.pixelCount)} exceed safe limit ${formatPixelCount(EXPORT_MAX_PIXELS)}. Reduce width, height, or scale.`
    );
  }
  options.warning = options.pixelCount > EXPORT_WARNING_PIXELS ?
    `Export pixels ${formatPixelCount(options.pixelCount)} are large; PNG encoding may be slow.` :
    '';

  return options;
}

function formatPixelCount(value) {
  return `${Math.round(value / 1000000)}MP`;
}

function getExportHeightForRatio(width, aspectRatio) {
  if (aspectRatio === '4:3') return Math.round(width * 3 / 4);
  return Math.round(width * 9 / 16);
}

function getAspectRatioParts(aspectRatio) {
  if (aspectRatio === '4:3') return { width: 4, height: 3 };
  return { width: 16, height: 9 };
}

function getRenderViewport(sourceViewport, aspectRatio) {
  const ratio = getAspectRatioParts(aspectRatio);
  const unit = Math.ceil(Math.max(
    sourceViewport.width / ratio.width,
    sourceViewport.height / ratio.height
  ));
  return {
    width: ratio.width * unit,
    height: ratio.height * unit,
    strategy: 'expand'
  };
}

function getDeviceScaleFactor(pixelWidth, renderViewport) {
  const factor = pixelWidth / renderViewport.width;
  if (!Number.isFinite(factor) || factor <= 0) return 1;
  return Number(factor.toFixed(6));
}

function readPngSize(filePath) {
  let fd = null;
  try {
    const header = Buffer.alloc(24);
    fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, header, 0, header.length, 0);
    if (
      header[0] !== 0x89 ||
      header[1] !== 0x50 ||
      header[2] !== 0x4e ||
      header[3] !== 0x47
    ) {
      return null;
    }
    return {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20)
    };
  } catch (error) {
    return null;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

async function createStaticServer() {
  const vite = await createViteDevServer();
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://127.0.0.1');
    if (requestUrl.pathname === '/' || requestUrl.pathname === '/map3d.html') {
      serveViteHtml(vite, request, response);
      return;
    }
    if (!shouldServeRawFile(requestUrl.pathname)) {
      vite.middlewares(request, response, (error) => {
        if (error) {
          console.error(error);
          response.writeHead(500);
          response.end(error.message);
          return;
        }
        response.writeHead(404);
        response.end('Not found');
      });
      return;
    }
    const pathname = decodeURIComponent(requestUrl.pathname);
    const relativePath = pathname === '/' ? 'map3d.html' : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(ROOT_DIR, relativePath);

    if (!filePath.startsWith(ROOT_DIR + path.sep) && filePath !== ROOT_DIR) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }

      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      response.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function shouldServeRawFile(pathname) {
  return /\.(dxf|png|jpe?g|svg|json)$/i.test(pathname) ||
    pathname.startsWith('/exports/');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const server = await createStaticServer();
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}${options.path}`;

  fs.mkdirSync(path.dirname(options.output), { recursive: true });

  try {
    const result = await exportWithFallback(options, url);
    console.log(`Exported ${options.output}`);
    console.log(`Image pixels: ${result.pixels[0]} x ${result.pixels[1]}`);
    console.log(`Target pixels: ${options.pixelWidth} x ${options.pixelHeight}`);
    console.log(`Source viewport: ${options.sourceViewport.width} x ${options.sourceViewport.height}`);
    console.log(`Render viewport: ${options.renderViewport.width} x ${options.renderViewport.height}`);
    console.log(`Device scale factor: ${options.deviceScaleFactor}`);
    console.log(`Acceleration: ${result.acceleration}${result.fallbackFrom ? ` (fallback from ${result.fallbackFrom})` : ''}`);
    if (result.warning) console.log(`Warning: ${result.warning}`);
    console.log(`Timings: ${JSON.stringify(result.timings)}`);
  } finally {
    server.close();
  }
}

function getChromiumLaunchOptions(acceleration, headed) {
  const args = [];
  if (acceleration === 'gpu') {
    args.push(
      '--ignore-gpu-blocklist',
      '--enable-gpu',
      '--enable-webgl',
      '--enable-accelerated-2d-canvas',
      '--use-angle=d3d11'
    );
  }
  if (acceleration === 'software') {
    args.push(
      '--disable-gpu',
      '--disable-accelerated-2d-canvas',
      '--use-angle=swiftshader'
    );
  }
  return { headless: !headed, args };
}

async function exportWithFallback(options, url) {
  if (options.acceleration !== 'gpu') {
    return runExportWithMode(options, url, options.acceleration);
  }
  let gpuError = null;
  try {
    return await runExportWithMode(options, url, 'gpu');
  } catch (error) {
    gpuError = error;
    console.warn('GPU export failed; retrying with auto acceleration.', error);
  }
  try {
    const result = await runExportWithMode(options, url, 'auto');
    result.fallbackFrom = 'gpu';
    result.warning = [
      options.warning,
      'GPU mode failed; retried with auto acceleration.'
    ].filter(Boolean).join(' ');
    return result;
  } catch (fallbackError) {
    throw new Error(`GPU export failed: ${gpuError.message}; fallback also failed: ${fallbackError.message}`);
  }
}

async function runExportWithMode(options, url, acceleration) {
  const totalStartedAt = Date.now();
  const timings = {};
  let browser = null;
  try {
    const launchStartedAt = Date.now();
    browser = await chromium.launch(getChromiumLaunchOptions(acceleration, options.headed));
    timings.browser = Date.now() - launchStartedAt;

    const contextStartedAt = Date.now();
    const context = await browser.newContext({
      viewport: { width: options.renderViewport.width, height: options.renderViewport.height },
      deviceScaleFactor: options.deviceScaleFactor
    });
    timings.context = Date.now() - contextStartedAt;

    const pageStartedAt = Date.now();
    const page = await context.newPage();
    page.setDefaultTimeout(options.wait);
    timings.page = Date.now() - pageStartedAt;

    const openStartedAt = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.wait });
    timings.open = Date.now() - openStartedAt;

    const readyStartedAt = Date.now();
    await waitForPosterReady(page, options.wait, options.settle);
    timings.ready = Date.now() - readyStartedAt;

    const screenshotStartedAt = Date.now();
    await page.screenshot({ path: options.output, fullPage: false, timeout: Math.max(options.wait, 180000) });
    timings.screenshot = Date.now() - screenshotStartedAt;
    timings.total = Date.now() - totalStartedAt;
    const screenshotSize = readPngSize(options.output);

    return {
      acceleration,
      warning: options.warning,
      pixels: screenshotSize ? [screenshotSize.width, screenshotSize.height] : [options.pixelWidth, options.pixelHeight],
      sourceViewport: options.sourceViewport,
      renderViewport: options.renderViewport,
      deviceScaleFactor: options.deviceScaleFactor,
      timings
    };
  } finally {
    if (browser) await browser.close();
  }
}

async function waitForPosterReady(page, wait, settle) {
  try {
    await page.waitForFunction(() => {
      const readyState = window.__MAP_EXPORT_READY;
      if (readyState && readyState.ready) return true;
      const status = document.getElementById('statusSummary');
      return status && status.textContent.indexOf('已加载') !== -1 && window.__PIPELINE_3D_READY === true;
    }, { timeout: wait });
  } catch (error) {
    const readyState = await page.evaluate(() => window.__MAP_EXPORT_READY || null).catch(() => null);
    throw new Error(`Timed out waiting for poster readiness: ${readyState ? JSON.stringify(readyState) : error.message}`);
  }

  try {
    await page.waitForLoadState('networkidle', { timeout: Math.min(wait, 5000) });
  } catch (error) {
    // AMap can keep background tile requests open; readiness is driven by the page flag above.
  }

  if (settle > 0) {
    await page.waitForTimeout(settle);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
