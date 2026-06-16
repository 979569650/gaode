const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = path.join(ROOT_DIR, 'exports', 'poster-8k.png');

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

function parseArgs(argv) {
  const options = {
    width: 1920,
    height: 1080,
    scale: 4,
    wait: 45000,
    settle: 15000,
    output: DEFAULT_OUTPUT,
    path: '/map3d.html?poster=1',
    headed: false
  };

  argv.forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const [key, value = ''] = arg.slice(2).split('=');
    if (key === 'width') options.width = Number(value);
    if (key === 'height') options.height = Number(value);
    if (key === 'scale') options.scale = Number(value);
    if (key === 'wait') options.wait = Number(value);
    if (key === 'settle') options.settle = Number(value);
    if (key === 'output') options.output = path.resolve(ROOT_DIR, value);
    if (key === 'path') options.path = value.startsWith('/') ? value : '/' + value;
    if (key === 'headed') options.headed = value !== 'false';
  });

  if (!Number.isFinite(options.width) || options.width <= 0) throw new Error('Invalid --width');
  if (!Number.isFinite(options.height) || options.height <= 0) throw new Error('Invalid --height');
  if (!Number.isFinite(options.scale) || options.scale <= 0) throw new Error('Invalid --scale');
  if (!Number.isFinite(options.wait) || options.wait <= 0) throw new Error('Invalid --wait');
  if (!Number.isFinite(options.settle) || options.settle < 0) throw new Error('Invalid --settle');

  return options;
}

function createStaticServer() {
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://127.0.0.1');
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const server = await createStaticServer();
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}${options.path}`;

  fs.mkdirSync(path.dirname(options.output), { recursive: true });

  const browser = await chromium.launch({ headless: !options.headed });
  try {
    const context = await browser.newContext({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: options.scale
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.wait });
    await page.waitForFunction(() => {
      const status = document.getElementById('statusText');
      return status && status.textContent.indexOf('已加载') !== -1;
    }, { timeout: options.wait });

    if (options.settle > 0) {
      await page.waitForTimeout(options.settle);
    }

    await page.screenshot({ path: options.output, fullPage: false });
    console.log(`Exported ${options.output}`);
    console.log(`Image pixels: ${options.width * options.scale} x ${options.height * options.scale}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
