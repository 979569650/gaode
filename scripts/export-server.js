const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
require('dotenv').config();
const { chromium } = require('playwright');

const ROOT_DIR = path.resolve(__dirname, '..');
const STYLE_CONFIG_FILE = path.join(ROOT_DIR, 'config', 'map3d-style.json');
const REQUESTED_PORT = Number(process.env.PORT || 8765);
const REQUESTED_HOST = process.env.HOST || '127.0.0.1';
const HTTPS_PFX_FILE = process.env.HTTPS_PFX_FILE ? path.resolve(ROOT_DIR, process.env.HTTPS_PFX_FILE) : '';
const HTTPS_PFX_PASSPHRASE = process.env.HTTPS_PFX_PASSPHRASE || '';
const HTTPS_CA_CERT_FILE = process.env.HTTPS_CA_CERT_FILE ? path.resolve(ROOT_DIR, process.env.HTTPS_CA_CERT_FILE) : '';
const CERT_HELPER_PORT = Number(process.env.CERT_HELPER_PORT || 0);
const ACTIVE_PROTOCOL = HTTPS_PFX_FILE ? 'https' : 'http';
let activePort = REQUESTED_PORT;
const EXPORT_ACCELERATION_MODES = ['auto', 'gpu', 'software'];
const EXPORT_ASPECT_RATIOS = ['16:9', '4:3'];
const DEFAULT_EXPORT_SETTLE = 2000;
const EXPORT_WARNING_PIXELS = 30000000;
const EXPORT_MAX_PIXELS = 90000000;
const DEFAULT_SOURCE_VIEWPORT = {width: 1920, height: 1080};
let exportBrowser = null;
let exportBrowserMode = '';
let exportContext = null;
let exportContextKey = '';
let exportInProgress = false;
let activeServer = null;
let certHelperServer = null;
let shuttingDown = false;

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

async function serveViteHtml(vite, request, response, htmlFile) {
  try {
    const htmlPath = path.join(ROOT_DIR, htmlFile || 'map3d.html');
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
    width: 5000,
    height: 2813,
    aspectRatio: '16:9',
    scale: 1,
    settle: DEFAULT_EXPORT_SETTLE,
    wait: 90000,
    acceleration: 'gpu'
  },
  pipeline: {
    color: 'rgba(255, 59, 31, 1)',
    mediumColor: 'rgba(255, 59, 31, 1)',
    lowColor: 'rgba(42, 184, 93, 1)',
    unknownColor: 'rgba(128, 136, 145, 1)',
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
    symbolColor: '#1d6cff',
    electricColor: '#1d6cff',
    weldedColor: '#2f80ed',
    regulatorColor: '#7c3aed',
    borderColor: '#12345c',
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
      width: normalizeInteger(exportConfig.width, DEFAULT_STYLE_CONFIG.export.width, 320, 12000),
      height: normalizeExportHeight(exportConfig.width, exportConfig.aspectRatio),
      aspectRatio: normalizeChoice(exportConfig.aspectRatio, DEFAULT_STYLE_CONFIG.export.aspectRatio, EXPORT_ASPECT_RATIOS),
      scale: normalizeNumber(exportConfig.scale, DEFAULT_STYLE_CONFIG.export.scale, 1, 8),
      settle: normalizeInteger(exportConfig.settle, DEFAULT_STYLE_CONFIG.export.settle, 0, 180000),
      wait: normalizeInteger(exportConfig.wait, DEFAULT_STYLE_CONFIG.export.wait, 5000, 240000),
      acceleration: normalizeChoice(exportConfig.acceleration, DEFAULT_STYLE_CONFIG.export.acceleration, EXPORT_ACCELERATION_MODES)
    },
    pipeline: {
      color: normalizeCssColor(pipeline.color, DEFAULT_STYLE_CONFIG.pipeline.color),
      mediumColor: normalizeCssColor(pipeline.mediumColor, pipeline.color || DEFAULT_STYLE_CONFIG.pipeline.mediumColor),
      lowColor: normalizeCssColor(pipeline.lowColor, DEFAULT_STYLE_CONFIG.pipeline.lowColor),
      unknownColor: normalizeCssColor(pipeline.unknownColor, DEFAULT_STYLE_CONFIG.pipeline.unknownColor),
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
      electricColor: normalizeCssColor(valves.electricColor, valves.symbolColor || DEFAULT_STYLE_CONFIG.valves.electricColor),
      weldedColor: normalizeCssColor(valves.weldedColor, DEFAULT_STYLE_CONFIG.valves.weldedColor),
      regulatorColor: normalizeCssColor(valves.regulatorColor, DEFAULT_STYLE_CONFIG.valves.regulatorColor),
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

function normalizeExportHeight(widthValue, aspectRatioValue) {
  const width = normalizeInteger(widthValue, DEFAULT_STYLE_CONFIG.export.width, 320, 12000);
  const aspectRatio = normalizeChoice(aspectRatioValue, DEFAULT_STYLE_CONFIG.export.aspectRatio, EXPORT_ASPECT_RATIOS);
  return getExportHeightForRatio(width, aspectRatio);
}

function getExportHeightForRatio(width, aspectRatio) {
  const normalizedWidth = normalizeInteger(width, DEFAULT_STYLE_CONFIG.export.width, 320, 12000);
  if (aspectRatio === '4:3') {
    return normalizeInteger(normalizedWidth * 3 / 4, DEFAULT_STYLE_CONFIG.export.height, 240, 10000);
  }
  return normalizeInteger(normalizedWidth * 9 / 16, DEFAULT_STYLE_CONFIG.export.height, 240, 10000);
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
  const zoom = view && Number(view.zoom);
  if (Number.isFinite(zoom)) params.set('zoom', String(zoom));
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

function formatPixelCount(value) {
  return `${Math.round(value / 1000000)}MP`;
}

function getExportNumber(payload, key, fallback, min, max, integer) {
  const raw = payload && payload[key] !== undefined && payload[key] !== '' ? payload[key] : fallback;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`Invalid ${key}`);
  }
  return integer ? Math.round(number) : number;
}

function getPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : NaN;
}

function firstPositiveNumber(values, fallback) {
  for (const value of values) {
    const number = getPositiveNumber(value);
    if (Number.isFinite(number)) return number;
  }
  return fallback;
}

function normalizeViewportDimension(value, fallback) {
  const number = Number.isFinite(value) && value > 0 ? value : fallback;
  return Math.max(1, Math.min(10000, Math.round(number)));
}

function normalizeSourceViewport(sourceViewport) {
  const source = sourceViewport && typeof sourceViewport === 'object' ? sourceViewport : {};
  const container = source.container && typeof source.container === 'object' ? source.container : {};
  const visualViewport = source.visualViewport && typeof source.visualViewport === 'object' ? source.visualViewport : {};
  const win = source.window && typeof source.window === 'object' ? source.window : {};
  const width = normalizeViewportDimension(firstPositiveNumber([
    source.cssWidth,
    source.width,
    source.containerWidth,
    container.width,
    source.innerWidth,
    source.windowWidth,
    win.innerWidth,
    visualViewport.width
  ], DEFAULT_SOURCE_VIEWPORT.width), DEFAULT_SOURCE_VIEWPORT.width);
  const height = normalizeViewportDimension(firstPositiveNumber([
    source.cssHeight,
    source.height,
    source.containerHeight,
    container.height,
    source.innerHeight,
    source.windowHeight,
    win.innerHeight,
    visualViewport.height
  ], DEFAULT_SOURCE_VIEWPORT.height), DEFAULT_SOURCE_VIEWPORT.height);
  const devicePixelRatio = firstPositiveNumber([
    source.devicePixelRatio,
    source.dpr
  ], 1);
  return {
    width,
    height,
    cssWidth: width,
    cssHeight: height,
    devicePixelRatio: Number(devicePixelRatio.toFixed(4)),
    window: {
      innerWidth: normalizeViewportDimension(firstPositiveNumber([win.innerWidth, source.innerWidth, source.windowWidth], width), width),
      innerHeight: normalizeViewportDimension(firstPositiveNumber([win.innerHeight, source.innerHeight, source.windowHeight], height), height)
    },
    visualViewport: {
      width: normalizeViewportDimension(firstPositiveNumber([visualViewport.width], width), width),
      height: normalizeViewportDimension(firstPositiveNumber([visualViewport.height], height), height),
      scale: Number(firstPositiveNumber([visualViewport.scale], 1).toFixed(4))
    }
  };
}

function getAspectRatioParts(aspectRatio) {
  if (aspectRatio === '4:3') return {width: 4, height: 3};
  return {width: 16, height: 9};
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
      header.length < 24 ||
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

function normalizeExportPayload(payload) {
  const width = getExportNumber(payload, 'width', DEFAULT_STYLE_CONFIG.export.width, 320, 12000, true);
  const aspectRatio = normalizeChoice(
    payload && payload.aspectRatio,
    DEFAULT_STYLE_CONFIG.export.aspectRatio,
    EXPORT_ASPECT_RATIOS
  );
  const height = getExportHeightForRatio(width, aspectRatio);
  const scale = getExportNumber(payload, 'scale', DEFAULT_STYLE_CONFIG.export.scale, 1, 8, false);
  const settle = getExportNumber(payload, 'settle', DEFAULT_STYLE_CONFIG.export.settle, 0, 180000, true);
  const wait = getExportNumber(payload, 'wait', DEFAULT_STYLE_CONFIG.export.wait, 5000, 240000, true);
  const acceleration = normalizeChoice(
    payload && payload.acceleration,
    DEFAULT_STYLE_CONFIG.export.acceleration,
    EXPORT_ACCELERATION_MODES
  );
  const pixelWidth = Math.round(width * scale);
  const pixelHeight = Math.round(height * scale);
  const pixelCount = pixelWidth * pixelHeight;
  const sourceViewport = normalizeSourceViewport(payload && payload.sourceViewport);
  const renderViewport = getRenderViewport(sourceViewport, aspectRatio);
  const deviceScaleFactor = getDeviceScaleFactor(pixelWidth, renderViewport);
  if (pixelCount > EXPORT_MAX_PIXELS) {
    throw new Error(
      `导出像素 ${formatPixelCount(pixelCount)} 超过安全上限 ${formatPixelCount(EXPORT_MAX_PIXELS)}，请降低宽高或倍率。`
    );
  }
  return {
    width,
    height,
    aspectRatio,
    scale,
    settle,
    wait,
    acceleration,
    view: payload && payload.view,
    sourceViewport,
    renderViewport,
    deviceScaleFactor,
    pixelWidth,
    pixelHeight,
    pixelCount,
    warning: pixelCount > EXPORT_WARNING_PIXELS ?
      `导出像素 ${formatPixelCount(pixelCount)} 较大，截图编码可能较慢。` :
      ''
  };
}

function getChromiumLaunchOptions(acceleration) {
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
  return {headless: true, args};
}

function isBrowserAlive(browser) {
  return browser && (typeof browser.isConnected !== 'function' || browser.isConnected());
}

async function closeExportContext() {
  if (!exportContext) return;
  const context = exportContext;
  exportContext = null;
  exportContextKey = '';
  try {
    await context.close();
  } catch (error) {
    console.warn('Failed to close export context', error);
  }
}

async function resetExportBrowser() {
  await closeExportContext();
  if (!exportBrowser) return;
  const browser = exportBrowser;
  exportBrowser = null;
  exportBrowserMode = '';
  try {
    await browser.close();
  } catch (error) {
    console.warn('Failed to close export browser', error);
  }
}

async function ensureExportBrowser(acceleration) {
  const startedAt = Date.now();
  if (isBrowserAlive(exportBrowser) && exportBrowserMode === acceleration) {
    return {browser: exportBrowser, reused: true, duration: 0};
  }
  await resetExportBrowser();
  exportBrowser = await chromium.launch(getChromiumLaunchOptions(acceleration));
  exportBrowserMode = acceleration;
  return {browser: exportBrowser, reused: false, duration: Date.now() - startedAt};
}

async function ensureExportContext(options, acceleration) {
  const browserInfo = await ensureExportBrowser(acceleration);
  const contextKey = [
    acceleration,
    options.renderViewport.width,
    options.renderViewport.height,
    options.deviceScaleFactor
  ].join(':');
  const startedAt = Date.now();
  if (exportContext && exportContextKey === contextKey) {
    return {
      context: exportContext,
      browserDuration: browserInfo.duration,
      browserReused: browserInfo.reused,
      contextDuration: 0,
      contextReused: true
    };
  }
  await closeExportContext();
  exportContext = await browserInfo.browser.newContext({
    viewport: {
      width: options.renderViewport.width,
      height: options.renderViewport.height
    },
    deviceScaleFactor: options.deviceScaleFactor,
    ignoreHTTPSErrors: true
  });
  exportContextKey = contextKey;
  return {
    context: exportContext,
    browserDuration: browserInfo.duration,
    browserReused: browserInfo.reused,
    contextDuration: Date.now() - startedAt,
    contextReused: false
  };
}

async function exportCurrentView(payload) {
  const options = normalizeExportPayload(payload || {});
  if (options.acceleration === 'gpu') {
    let gpuError = null;
    try {
      return await runExportSafely(options, 'gpu');
    } catch (error) {
      gpuError = error;
      console.warn('GPU export failed; retrying with auto acceleration.', error);
    }
    try {
      const fallbackResult = await runExportSafely({...options, acceleration: 'auto'}, 'auto');
      fallbackResult.fallbackFrom = 'gpu';
      fallbackResult.warning = [
        options.warning,
        'GPU 模式失败，已自动使用 auto 模式重试。'
      ].filter(Boolean).join(' ');
      return fallbackResult;
    } catch (fallbackError) {
      throw new Error(
        `GPU 模式导出失败: ${gpuError.message}; 自动降级也失败: ${fallbackError.message}`
      );
    }
  }
  return runExportSafely(options, options.acceleration);
}

async function runExportSafely(options, acceleration) {
  try {
    return await runExportWithMode(options, acceleration);
  } catch (error) {
    await resetExportBrowser();
    throw error;
  }
}

async function runExportWithMode(options, acceleration) {
  const totalStartedAt = Date.now();
  const metrics = {};
  const relativeFile = `exports/poster-${timestampName()}-${options.pixelWidth}x${options.pixelHeight}.png`;
  const output = path.join(ROOT_DIR, relativeFile);
  fs.mkdirSync(path.dirname(output), {recursive: true});

  const contextInfo = await ensureExportContext(options, acceleration);
  metrics.browser = contextInfo.browserDuration;
  metrics.browserReused = contextInfo.browserReused;
  metrics.context = contextInfo.contextDuration;
  metrics.contextReused = contextInfo.contextReused;

  let page = null;
  try {
    const pageStartedAt = Date.now();
    page = await contextInfo.context.newPage();
    page.setDefaultTimeout(options.wait);
    metrics.page = Date.now() - pageStartedAt;

    const url = `${ACTIVE_PROTOCOL}://127.0.0.1:${activePort}${buildPosterPath(options.view)}`;
    const openStartedAt = Date.now();
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: options.wait});
    metrics.open = Date.now() - openStartedAt;

    const readyStartedAt = Date.now();
    await waitForPosterReady(page, options.wait, options.settle);
    metrics.ready = Date.now() - readyStartedAt;

    const screenshotStartedAt = Date.now();
    await page.screenshot({path: output, fullPage: false, timeout: Math.max(options.wait, 180000)});
    metrics.screenshot = Date.now() - screenshotStartedAt;
    metrics.total = Date.now() - totalStartedAt;
    const screenshotSize = readPngSize(output);
    const actualPixels = screenshotSize ? [screenshotSize.width, screenshotSize.height] : [options.pixelWidth, options.pixelHeight];

    return {
      file: relativeFile.replace(/\//g, path.sep),
      pixels: actualPixels,
      targetPixels: [options.pixelWidth, options.pixelHeight],
      pixelCount: options.pixelCount,
      acceleration,
      warning: options.warning,
      sourceViewport: options.sourceViewport,
      renderViewport: options.renderViewport,
      deviceScaleFactor: options.deviceScaleFactor,
      ratioStrategy: options.renderViewport.strategy,
      timings: metrics
    };
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (error) {
        console.warn('Failed to close export page', error);
      }
    }
  }
}

async function waitForPosterReady(page, wait, settle) {
  try {
    await page.waitForFunction(() => {
      const readyState = window.__MAP_EXPORT_READY;
      if (readyState && readyState.ready) return true;
      const status = document.getElementById('statusSummary');
      return status && status.textContent.indexOf('已加载') !== -1 && window.__PIPELINE_3D_READY === true;
    }, {timeout: wait});
  } catch (error) {
    const readyState = await page.evaluate(() => window.__MAP_EXPORT_READY || null).catch(() => null);
    throw new Error(`等待页面导出就绪超时: ${readyState ? JSON.stringify(readyState) : error.message}`);
  }

  try {
    await page.waitForLoadState('networkidle', {timeout: Math.min(wait, 5000)});
  } catch (error) {
    // AMap may keep tile requests active; readiness is driven by the page flag above.
  }

  if (settle > 0) await page.waitForTimeout(settle);
}

async function handleExport(request, response) {
  if (exportInProgress) {
    sendJson(response, 409, {ok: false, error: '已有高清导出正在进行，请等待当前任务完成。'});
    return;
  }
  exportInProgress = true;
  try {
    const payload = await readRequestJson(request);
    const result = await exportCurrentView(payload);
    sendJson(response, 200, {ok: true, ...result});
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {ok: false, error: error.message});
  } finally {
    exportInProgress = false;
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

async function createServer() {
  const vite = await createViteDevServer();
  const requestHandler = (request, response) => {
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
    if (shouldServeRawFile(requestUrl.pathname)) {
      serveStatic(request, response);
      return;
    }
    if (requestUrl.pathname === '/' || requestUrl.pathname === '/map3d.html') {
      serveViteHtml(vite, request, response, 'map3d.html');
      return;
    }
    if (requestUrl.pathname === '/navigation.html') {
      serveViteHtml(vite, request, response, 'navigation.html');
      return;
    }
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
  };
  if (!HTTPS_PFX_FILE) return http.createServer(requestHandler);
  return https.createServer({
    pfx: fs.readFileSync(HTTPS_PFX_FILE),
    passphrase: HTTPS_PFX_PASSPHRASE
  }, requestHandler);
}

function shouldServeRawFile(pathname) {
  return /\.(dxf|png|jpe?g|svg|json)$/i.test(pathname) ||
    pathname.startsWith('/exports/');
}

async function listen(port, attemptsLeft) {
  activePort = port;
  const server = await createServer();
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    throw error;
  });
  server.listen(port, REQUESTED_HOST, () => {
    activeServer = server;
    const displayHost = REQUESTED_HOST === '0.0.0.0' ? '127.0.0.1' : REQUESTED_HOST;
    console.log(`Open ${ACTIVE_PROTOCOL}://${displayHost}:${port}/map3d.html`);
    if (REQUESTED_HOST === '0.0.0.0') {
      console.log(`LAN access is enabled on port ${port}. Use this computer's LAN IPv4 address from your phone.`);
    }
    startCertificateHelperServer(port);
    console.log('Adjust the map view, then press Ctrl+Shift+E in the page to export.');
  });
}

function startCertificateHelperServer(mainPort) {
  if (!HTTPS_CA_CERT_FILE || !CERT_HELPER_PORT || certHelperServer) return;
  certHelperServer = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, `http://127.0.0.1:${CERT_HELPER_PORT}`);
    if (requestUrl.pathname === '/gaode-local-root-ca.cer') {
      fs.readFile(HTTPS_CA_CERT_FILE, (error, data) => {
        if (error) {
          response.writeHead(404);
          response.end('Certificate not found');
          return;
        }
        response.writeHead(200, {
          'Content-Type': 'application/x-x509-ca-cert',
          'Content-Disposition': 'attachment; filename="gaode-local-root-ca.cer"',
          'Cache-Control': 'no-store'
        });
        response.end(data);
      });
      return;
    }
    response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
    response.end([
      '<!doctype html><meta charset="utf-8"><title>Gaode Local HTTPS Certificate</title>',
      '<body style="font-family:system-ui,sans-serif;line-height:1.6;padding:24px">',
      '<h1>Gaode Local HTTPS Certificate</h1>',
      '<p>Install this root certificate on your phone, then open the HTTPS navigation page.</p>',
      '<p><a href="/gaode-local-root-ca.cer">Download root CA certificate</a></p>',
      '<p>Navigation URL: <code>https://' + getLanDisplayHost() + ':' + mainPort + '/navigation.html</code></p>',
      '</body>'
    ].join(''));
  });
  certHelperServer.listen(CERT_HELPER_PORT, REQUESTED_HOST, () => {
    const displayHost = REQUESTED_HOST === '0.0.0.0' ? getLanDisplayHost() : REQUESTED_HOST;
    console.log(`Certificate helper: http://${displayHost}:${CERT_HELPER_PORT}/`);
  });
}

function getLanDisplayHost() {
  return process.env.LAN_HOST || '127.0.0.1';
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    if (certHelperServer) {
      certHelperServer.close();
      certHelperServer = null;
    }
    await resetExportBrowser();
  } finally {
    if (activeServer) {
      activeServer.close(() => process.exit(0));
    } else {
      process.exit(0);
    }
  }
  setTimeout(() => process.exit(0), 1000).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

listen(REQUESTED_PORT, 20).catch((error) => {
  console.error(error);
  process.exit(1);
});
