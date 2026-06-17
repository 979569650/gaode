const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT_DIR = path.resolve(__dirname, '..');
const STYLE_CONFIG_FILE = path.join(ROOT_DIR, 'config', 'map3d-style.json');
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
  '.svg': 'image/svg+xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const DEFAULT_STYLE_CONFIG = {
  area: {
    path: [],
    fillColor: 'rgba(79, 176, 198, 0.18)',
    strokeColor: 'rgba(216, 244, 255, 0.62)',
    outsideFillColor: 'rgba(0, 0, 0, 0.18)',
    strokeWeight: 1
  },
  buildings: {
    roofColor: 'rgba(232, 238, 242, 0.95)',
    wallColor: 'rgba(96, 116, 132, 0.95)'
  },
  layers: {
    satellite: 10,
    road: 20,
    outsideMask: 50,
    area: 60,
    model: 100,
    pipeline: 180,
    label: 240
  },
  ui: {
    collapsed: false,
    activeTab: 'data',
    detailsOpen: false
  },
  view: {
    center: [116.333926, 39.997245],
    zoom: 17.1,
    pitch: 64,
    rotation: -24
  },
  data: {
    projectionId: 'cgcs2000-gk-117'
  },
  export: {
    width: 3000,
    height: 1688,
    scale: 4,
    settle: 60000,
    wait: 90000
  },
  pipeline: {
    color: 'rgba(255, 59, 31, 1)',
    verticalColor: 'rgba(255, 106, 0, 1)',
    undergroundColor: 'rgba(255, 59, 31, 0.46)',
    radius: 0.38,
    verticalRadius: 0.55,
    groundSearchRadius: 0.5,
    groundOffset: 0
  },
  valves: {
    width: 28,
    height: 38,
    dedupePixelDistance: 28,
    showLabel: false,
    symbolColor: '#ea7a1b',
    borderColor: '#382112',
    accentColor: '#ffcf7a'
  }
};

function sendJson(response, status, body) {
  response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'});
  response.end(JSON.stringify(body));
}

function normalizeCssColor(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const color = value.trim();
  if (!color || color.length > 80) return fallback;
  return color;
}

function normalizeStylePath(pathValue) {
  if (!Array.isArray(pathValue)) return [];
  return pathValue.reduce((points, point) => {
    if (!Array.isArray(point) || point.length < 2) return points;
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return points;
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return points;
    points.push([lng, lat]);
    return points;
  }, []);
}

function normalizeStyleConfig(value) {
  const area = value && typeof value === 'object' ? value.area || {} : {};
  const buildings = value && typeof value === 'object' ? value.buildings || {} : {};
  const layers = value && typeof value === 'object' ? value.layers || {} : {};
  const ui = value && typeof value === 'object' ? value.ui || {} : {};
  const view = value && typeof value === 'object' ? value.view || {} : {};
  const data = value && typeof value === 'object' ? value.data || {} : {};
  const exportConfig = value && typeof value === 'object' ? value.export || {} : {};
  const pipeline = value && typeof value === 'object' ? value.pipeline || {} : {};
  const valves = value && typeof value === 'object' ? value.valves || {} : {};
  const strokeWeight = Number(area.strokeWeight);
  return {
    area: {
      path: normalizeStylePath(area.path),
      fillColor: normalizeCssColor(area.fillColor, DEFAULT_STYLE_CONFIG.area.fillColor),
      strokeColor: normalizeCssColor(area.strokeColor, DEFAULT_STYLE_CONFIG.area.strokeColor),
      outsideFillColor: normalizeCssColor(area.outsideFillColor, DEFAULT_STYLE_CONFIG.area.outsideFillColor),
      strokeWeight: Number.isFinite(strokeWeight) ?
        Math.max(0, Math.min(20, strokeWeight)) :
        DEFAULT_STYLE_CONFIG.area.strokeWeight
    },
    buildings: {
      roofColor: normalizeCssColor(buildings.roofColor, DEFAULT_STYLE_CONFIG.buildings.roofColor),
      wallColor: normalizeCssColor(buildings.wallColor, DEFAULT_STYLE_CONFIG.buildings.wallColor)
    },
    layers: {
      satellite: normalizeLayerZIndex(layers.satellite, DEFAULT_STYLE_CONFIG.layers.satellite),
      road: normalizeLayerZIndex(layers.road, DEFAULT_STYLE_CONFIG.layers.road),
      outsideMask: normalizeLayerZIndex(layers.outsideMask, DEFAULT_STYLE_CONFIG.layers.outsideMask),
      area: normalizeLayerZIndex(layers.area, DEFAULT_STYLE_CONFIG.layers.area),
      model: normalizeLayerZIndex(layers.model, DEFAULT_STYLE_CONFIG.layers.model),
      pipeline: normalizeLayerZIndex(layers.pipeline, DEFAULT_STYLE_CONFIG.layers.pipeline),
      label: normalizeLayerZIndex(layers.label, DEFAULT_STYLE_CONFIG.layers.label)
    },
    ui: {
      collapsed: Boolean(ui.collapsed),
      activeTab: normalizeChoice(ui.activeTab, DEFAULT_STYLE_CONFIG.ui.activeTab, ['data', 'area', 'style', 'layers', 'export', 'advanced']),
      detailsOpen: Boolean(ui.detailsOpen)
    },
    view: {
      center: normalizeLngLat(view.center, DEFAULT_STYLE_CONFIG.view.center),
      zoom: normalizeNumber(view.zoom, DEFAULT_STYLE_CONFIG.view.zoom, 2, 20),
      pitch: normalizeNumber(view.pitch, DEFAULT_STYLE_CONFIG.view.pitch, 0, 83),
      rotation: normalizeNumber(view.rotation, DEFAULT_STYLE_CONFIG.view.rotation, -360, 360)
    },
    data: {
      projectionId: normalizeText(data.projectionId, DEFAULT_STYLE_CONFIG.data.projectionId, 80)
    },
    export: {
      width: normalizeInteger(exportConfig.width, DEFAULT_STYLE_CONFIG.export.width, 320, 10000),
      height: normalizeInteger(exportConfig.height, DEFAULT_STYLE_CONFIG.export.height, 240, 10000),
      scale: normalizeNumber(exportConfig.scale, DEFAULT_STYLE_CONFIG.export.scale, 1, 8),
      settle: normalizeInteger(exportConfig.settle, DEFAULT_STYLE_CONFIG.export.settle, 0, 180000),
      wait: normalizeInteger(exportConfig.wait, DEFAULT_STYLE_CONFIG.export.wait, 5000, 240000)
    },
    pipeline: {
      color: normalizeCssColor(pipeline.color, DEFAULT_STYLE_CONFIG.pipeline.color),
      verticalColor: normalizeCssColor(pipeline.verticalColor, DEFAULT_STYLE_CONFIG.pipeline.verticalColor),
      undergroundColor: normalizeCssColor(pipeline.undergroundColor, DEFAULT_STYLE_CONFIG.pipeline.undergroundColor),
      radius: normalizeNumber(pipeline.radius, DEFAULT_STYLE_CONFIG.pipeline.radius, 0.05, 5),
      verticalRadius: normalizeNumber(pipeline.verticalRadius, DEFAULT_STYLE_CONFIG.pipeline.verticalRadius, 0.05, 5),
      groundSearchRadius: normalizeNumber(pipeline.groundSearchRadius, DEFAULT_STYLE_CONFIG.pipeline.groundSearchRadius, 0, 5),
      groundOffset: normalizeNumber(pipeline.groundOffset, DEFAULT_STYLE_CONFIG.pipeline.groundOffset, -20, 20)
    },
    valves: {
      width: normalizeInteger(valves.width, DEFAULT_STYLE_CONFIG.valves.width, 12, 80),
      height: normalizeInteger(valves.height, DEFAULT_STYLE_CONFIG.valves.height, 16, 100),
      dedupePixelDistance: normalizeInteger(valves.dedupePixelDistance, DEFAULT_STYLE_CONFIG.valves.dedupePixelDistance, 0, 120),
      showLabel: Boolean(valves.showLabel),
      symbolColor: normalizeCssColor(valves.symbolColor, DEFAULT_STYLE_CONFIG.valves.symbolColor),
      borderColor: normalizeCssColor(valves.borderColor, DEFAULT_STYLE_CONFIG.valves.borderColor),
      accentColor: normalizeCssColor(valves.accentColor, DEFAULT_STYLE_CONFIG.valves.accentColor)
    }
  };
}

function normalizeLayerZIndex(value, fallback) {
  const zIndex = Number(value);
  if (!Number.isFinite(zIndex)) return fallback;
  return Math.max(0, Math.min(10000, Math.round(zIndex)));
}

function normalizeNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeInteger(value, fallback, min, max) {
  return Math.round(normalizeNumber(value, fallback, min, max));
}

function normalizeText(value, fallback, maxLength) {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  if (!text || text.length > maxLength) return fallback;
  return text;
}

function normalizeChoice(value, fallback, choices) {
  return choices.includes(value) ? value : fallback;
}

function normalizeLngLat(value, fallback) {
  if (!Array.isArray(value) || value.length < 2) return fallback;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return fallback;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return fallback;
  return [lng, lat];
}

async function readStyleConfig() {
  try {
    const text = await fs.promises.readFile(STYLE_CONFIG_FILE, 'utf8');
    return normalizeStyleConfig(JSON.parse(text));
  } catch (error) {
    if (error.code === 'ENOENT') return normalizeStyleConfig(DEFAULT_STYLE_CONFIG);
    throw error;
  }
}

async function writeStyleConfig(config) {
  const normalized = normalizeStyleConfig(config);
  await fs.promises.mkdir(path.dirname(STYLE_CONFIG_FILE), {recursive: true});
  await fs.promises.writeFile(STYLE_CONFIG_FILE, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
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
    const status = document.getElementById('statusSummary');
    return status && status.textContent.indexOf('已加载') !== -1 && window.__PIPELINE_3D_READY !== false;
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

async function handleGetStyleConfig(request, response) {
  try {
    const config = await readStyleConfig();
    sendJson(response, 200, {ok: true, config});
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {ok: false, error: error.message});
  }
}

async function handleSaveStyleConfig(request, response) {
  try {
    const payload = await readRequestJson(request);
    const config = await writeStyleConfig(payload.config || payload);
    sendJson(response, 200, {ok: true, config});
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
    const requestUrl = new URL(request.url, `http://127.0.0.1:${activePort}`);
    if (request.method === 'POST' && requestUrl.pathname === '/api/export-current-view') {
      handleExport(request, response);
      return;
    }
    if (request.method === 'GET' && requestUrl.pathname === '/api/map-style-config') {
      handleGetStyleConfig(request, response);
      return;
    }
    if (request.method === 'POST' && requestUrl.pathname === '/api/map-style-config') {
      handleSaveStyleConfig(request, response);
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
