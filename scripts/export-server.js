const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT_DIR = path.resolve(__dirname, '..');
const REQUESTED_PORT = Number(process.env.PORT || 8765);
let activePort = REQUESTED_PORT;

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

function sendJson(response, status, body) {
  response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'});
  response.end(JSON.stringify(body));
}

function readRequestJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function buildPosterPath(view) {
  const params = new URLSearchParams();
  params.set('poster', '1');
  if (view && Array.isArray(view.center)) params.set('center', `${view.center[0]},${view.center[1]}`);
  if (view && Number.isFinite(Number(view.zoom))) params.set('zoom', String(view.zoom));
  if (view && Number.isFinite(Number(view.pitch))) params.set('pitch', String(view.pitch));
  if (view && Number.isFinite(Number(view.rotation))) params.set('rotation', String(view.rotation));
  return `/map3d.html?${params.toString()}`;
}

function timestampName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('');
}

async function exportCurrentView(payload) {
  const width = Number(payload.width || 1920);
  const height = Number(payload.height || 1080);
  const scale = Number(payload.scale || 4);
  const settle = Number(payload.settle || 60000);
  const wait = Number(payload.wait || 90000);
  if (!Number.isFinite(width) || width <= 0) throw new Error('Invalid width');
  if (!Number.isFinite(height) || height <= 0) throw new Error('Invalid height');
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Invalid scale');

  const relativeFile = `exports/poster-${timestampName()}-${width * scale}x${height * scale}.png`;
  const output = path.join(ROOT_DIR, relativeFile);
  fs.mkdirSync(path.dirname(output), {recursive: true});

  const browser = await chromium.launch({headless: true});
  try {
    const context = await browser.newContext({
      viewport: {width, height},
      deviceScaleFactor: scale
    });
    const page = await context.newPage();
    page.setDefaultTimeout(wait);
    const url = `http://127.0.0.1:${activePort}${buildPosterPath(payload.view)}`;
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: wait});
    await waitForPosterReady(page, wait, settle);
    await page.screenshot({path: output, fullPage: false, timeout: Math.max(wait, 180000)});
    return {file: relativeFile.replace(/\//g, path.sep), pixels: [width * scale, height * scale]};
  } finally {
    await browser.close();
  }
}

async function waitForPosterReady(page, wait, settle) {
  await page.waitForFunction(() => {
    const status = document.getElementById('statusText');
    return status && status.textContent.indexOf('已加载') !== -1;
  }, {timeout: wait});

  try {
    await page.waitForLoadState('networkidle', {timeout: Math.min(wait, 60000)});
  } catch (error) {
    // AMap may keep long-polling or late tile requests alive; the settle wait below is the fallback.
  }

  if (settle > 0) await page.waitForTimeout(settle);
}

async function handleExport(request, response) {
  try {
    const payload = await readRequestJson(request);
    const result = await exportCurrentView(payload);
    sendJson(response, 200, {ok: true, ...result});
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {ok: false, error: error.message});
  }
}

function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://127.0.0.1:${activePort}`);
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
}

function createServer() {
  return http.createServer((request, response) => {
    if (request.method === 'POST' && request.url === '/api/export-current-view') {
      handleExport(request, response);
      return;
    }
    serveStatic(request, response);
  });
}

function listen(port, attemptsLeft) {
  activePort = port;
  const server = createServer();
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    throw error;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Open http://127.0.0.1:${port}/map3d.html`);
    console.log('Adjust the map view, then press Ctrl+Shift+E in the page to export.');
  });
}

listen(REQUESTED_PORT, 20);
