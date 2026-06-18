import './styles/map3d.css';
import proj4 from 'proj4';
import * as THREE from 'three';
import AMapLoader from '@amap/amap-jsapi-loader';

window.proj4 = proj4;
window.THREE = THREE;
window.__THREE_LOAD_FAILED = false;

var AMap = null;

var DXF_FILE_NAME = import.meta.env.VITE_DXF_FILE_NAME || '宽厚里.dxf';
var WGS84 = 'WGS84';
var POSTER_MODE = window.IS_POSTER_MODE === true;
var MAP_STYLE_CONFIG_API = '/api/map-style-config';
var BUILDING_STYLE_AREA_MIN_POINTS = 3;
var EXPORT_ACCELERATION_MODES = ['auto', 'gpu', 'software'];
var EXPORT_ASPECT_RATIOS = ['16:9', '4:3'];
var EXPORT_WARNING_PIXELS = 30000000;
var EXPORT_MAX_PIXELS = 90000000;
var EXPORT_PRESETS = {
  preview: {
    label: '快速预览',
    width: 1920,
    aspectRatio: '16:9',
    scale: 1,
    settle: 1500,
    wait: 60000,
    acceleration: 'gpu'
  },
  hd: {
    label: '高清',
    width: 5000,
    aspectRatio: '16:9',
    scale: 1,
    settle: 2000,
    wait: 90000,
    acceleration: 'gpu'
  },
  ultra: {
    label: '超高清',
    width: 8000,
    aspectRatio: '16:9',
    scale: 1,
    settle: 2500,
    wait: 120000,
    acceleration: 'gpu'
  },
  max: {
    label: '12000',
    width: 12000,
    aspectRatio: '16:9',
    scale: 1,
    settle: 2500,
    wait: 120000,
    acceleration: 'gpu'
  }
};
var DEFAULT_MAP_STYLE_CONFIG = {
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
    settle: 2000,
    wait: 90000,
    acceleration: 'gpu'
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
var VIEW_PRESET = {
  center: [117.030804, 36.66382],
  zoom: 18.33,
  pitch: 35.9,
  rotation: 0.5,
  fitZoom: 17.38,
  fitPadding: [98, 96, 138, 120],
  mapStyle: 'amap://styles/normal'
};
var SATELLITE_LAYER_ZINDEX = 10;
var ROAD_NET_LAYER_ZINDEX = 20;
var BUILDING_STYLE_OUTSIDE_ZINDEX = 50;
var BUILDING_STYLE_AREA_ZINDEX = 60;
var PIPELINE_LAYER_ZINDEX = 180;
var MODEL_LAYER_ZINDEX = 100;
var LABEL_LAYER_ZINDEX = 240;
var PIPELINE_STYLE = {
  baseColor: '#382112',
  baseOpacity: 0.72,
  baseWeight: 8.6,
  glowColor: '#d47a2b',
  glowOpacity: 0.2,
  glowWeight: 6.2,
  strokeColor: '#ff3b1f',
  strokeOpacity: 0.96,
  strokeWeight: 4.2,
  lineJoin: 'miter',
  lineCap: 'butt',
  zIndexBase: PIPELINE_LAYER_ZINDEX,
  zIndexGlow: PIPELINE_LAYER_ZINDEX + 4,
  zIndexTop: PIPELINE_LAYER_ZINDEX + 8
};
var PIPELINE_3D_STYLE = {
  radius: 0.38,
  verticalRadius: 0.55,
  radialSegments: 12,
  color: 0xff3b1f,
  undergroundColor: 0xff3b1f,
  verticalColor: 0xff6a00,
  verticalHaloColor: 0xffb000,
  emissive: 0x8a1200,
  undergroundEmissive: 0x4c0b00,
  verticalEmissive: 0x9a2200,
  roughness: 0.42,
  metalness: 0.08,
  groundSearchRadius: 0.5,
  groundOffset: 0,
  heightScale: 1,
  jointRadius: 0.58,
  verticalHaloRadius: 1.05,
  undergroundOpacity: 0.46,
  verticalPlanarTolerance: 0.25,
  verticalHeightTolerance: 0.1,
  zIndex: PIPELINE_LAYER_ZINDEX
};
var VALVE_STYLE = {
  symbolColor: '#ea7a1b',
  borderColor: '#382112',
  accentColor: '#ffcf7a',
  poleColor: 'rgba(56, 33, 18, 0.72)',
  textColor: '#6e3a12',
  haloColor: 'rgba(247, 238, 218, 0.86)',
  width: 28,
  height: 38,
  dedupePixelDistance: 28,
  zIndex: LABEL_LAYER_ZINDEX,
  showLabel: false
};
var VALVE_KEYWORDS = ['阀门', '阀'];
var DXF_TEXT_ENCODINGS = ['gb18030', 'gbk', 'utf-8'];
var SEGMENT_MERGE_TOLERANCE = 0.8;
var CRS_DEFS = {
  'cgcs2000-gk-117': {
    label: 'CGCS2000 3-degree GK CM 117E',
    definition: '+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs'
  },
  'cgcs2000-gk-114': {
    label: 'CGCS2000 3-degree GK CM 114E',
    definition: '+proj=tmerc +lat_0=0 +lon_0=114 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs'
  },
  'cgcs2000-gk-120': {
    label: 'CGCS2000 3-degree GK CM 120E',
    definition: '+proj=tmerc +lat_0=0 +lon_0=120 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs'
  },
  'cgcs2000-utm-50n': {
    label: 'CGCS2000 UTM Zone 50N',
    definition: '+proj=utm +zone=50 +datum=WGS84 +units=m +no_defs'
  }
};
var map;
var satelliteLayer;
var roadNetLayer;
var buildingsLayer;
var buildingStyleAreaOverlay = null;
var buildingStyleOutsideOverlay = null;
var mapStyleConfig = cloneMapStyleConfig(DEFAULT_MAP_STYLE_CONFIG);
var savedBuildingStyleAreaPath = [];
var draftBuildingStyleAreaPath = [];
var isDrawingBuildingStyleArea = false;
var dxfOverlays = [];
var dxfValveOverlays = [];
var dxfThreeLayer = null;
var dxfThreeState = null;
var currentProjected = null;
var currentDxfText = '';
var currentProjectionId = 'cgcs2000-gk-117';
var pendingStyleConfigTimer = null;
var pendingValveRefreshTimer = null;
var pendingDeferredLayerCount = 0;
var isPosterExporting = false;
var deferredLayerTimers = [];
var dxfProcessingCache = {
  text: null,
  parsed: null,
  mergedFeatures: null,
  projectedByKey: {}
};
var INITIAL_VIEW = readViewFromUrl();
var exportReadyState = {
  dxf: false,
  pipeline3d: false,
  valves: false,
  deferredLayers: false,
  ready: false,
  status: '初始化',
  updatedAt: Date.now()
};
window.__PIPELINE_3D_READY = false;
window.__MAP_EXPORT_READY = exportReadyState;

function mapInit(){
  registerProjectionDefs();

  map = new AMap.Map('container', {
    animateEnable:false,
    rotateEnable:true,
    pitchEnable:true,
    zoom:INITIAL_VIEW.zoom,
    pitch:INITIAL_VIEW.pitch,
    rotation:INITIAL_VIEW.rotation,
    viewMode:'3D',
    zooms:[2,20],
    center:INITIAL_VIEW.center,
    showLabel:true,
    showBuildingBlock:false,
    features:['point'],
    mapStyle:VIEW_PRESET.mapStyle
  });

  addSatelliteImageryLayer();
  deferMapLayer(addRoadNetLayer, 350);
  deferMapLayer(addBuildingsLayer, 800);
  loadMapStyleConfig();

  if (!POSTER_MODE) {
    var controlBar = new AMap.ControlBar({
      position:{
        right:'10px',
        top:'10px'
      }
    });
    controlBar.addTo(map);

    var toolBar = new AMap.ToolBar({
      position:{
        right:'40px',
        top:'110px'
      }
    });
    toolBar.addTo(map);
  }

  initPipelineTools();
  initValveRefreshEvents();
  initExportHotkeys();
  loadDefaultDxf();
}

function updateExportReadyState(patch){
  Object.keys(patch).forEach(function(key){
    exportReadyState[key] = patch[key];
  });
  exportReadyState.ready = Boolean(
    exportReadyState.dxf &&
    exportReadyState.pipeline3d &&
    exportReadyState.valves &&
    exportReadyState.deferredLayers
  );
  exportReadyState.status = exportReadyState.ready ? 'ready' : getExportReadyStatus();
  exportReadyState.updatedAt = Date.now();
  window.__MAP_EXPORT_READY = exportReadyState;
}

function getExportReadyStatus(){
  if (!exportReadyState.deferredLayers) return '等待地图延迟图层';
  if (!exportReadyState.dxf) return '等待 DXF 数据';
  if (!exportReadyState.pipeline3d) return '等待 3D 管线';
  if (!exportReadyState.valves) return '等待阀门覆盖物';
  return '等待导出就绪';
}

function deferMapLayer(task, delay){
  pendingDeferredLayerCount += 1;
  updateExportReadyState({deferredLayers: false});
  deferredLayerTimers.push(window.setTimeout(function(){
    try {
      task();
    } finally {
      pendingDeferredLayerCount = Math.max(0, pendingDeferredLayerCount - 1);
      updateExportReadyState({deferredLayers: pendingDeferredLayerCount === 0});
    }
  }, delay));
}

function addSatelliteImageryLayer(){
  if (!AMap.TileLayer || !AMap.TileLayer.Satellite) return;
  satelliteLayer = new AMap.TileLayer.Satellite({
    zIndex: getLayerZIndex('satellite')
  });
  map.addLayer(satelliteLayer);
}

function addRoadNetLayer(){
  if (!AMap.TileLayer || !AMap.TileLayer.RoadNet) return;
  roadNetLayer = new AMap.TileLayer.RoadNet({
    zIndex: getLayerZIndex('road')
  });
  map.addLayer(roadNetLayer);
}

function addBuildingsLayer(){
  // 使用官方 3D 楼块图层，替代地图默认白模。
  // 这里的构造参数控制整个图层，后面的 setStyle 再覆盖项目范围内的样式。
  if (buildingsLayer) return;
  if (!AMap.Buildings) return;
  var roofColor = normalizeCssColor(mapStyleConfig.buildings.roofColor, DEFAULT_MAP_STYLE_CONFIG.buildings.roofColor);
  var wallColor = normalizeCssColor(mapStyleConfig.buildings.wallColor, DEFAULT_MAP_STYLE_CONFIG.buildings.wallColor);
  buildingsLayer = new AMap.Buildings({
    // 模型层放在管线层之上、文字标注层之下。
    zIndex: getLayerZIndex('model'),
    // 高德楼块在近距离缩放级别下才有意义。
    zooms: [16, 20],
    // 1 表示使用官方楼高；只有需要夸张天际线时才调大。
    heightFactor: 1,
    // 只通过 setStyle 显示范围内楼块，范围外楼块隐藏。
    wallColor: wallColor,
    roofColor: roofColor
  });
  map.addLayer(buildingsLayer);
  refreshBuildingsStyleFromCurrentState();
}

function updateBuildingsLayerStyle(projected){
  // Buildings 的样式只在 path 范围内生效，所以这里用投影后的 DXF 范围
  // 动态生成样式区域，避免写死某个城市或固定矩形。
  if (!buildingsLayer || typeof buildingsLayer.setStyle !== 'function' || !projected || !projected.bounds) {
    if (savedBuildingStyleAreaPath.length >= BUILDING_STYLE_AREA_MIN_POINTS) {
      applyBuildingsLayerStyle(savedBuildingStyleAreaPath);
    } else {
      clearBuildingStyleAreaOverlay();
    }
    return;
  }
  if (savedBuildingStyleAreaPath.length >= BUILDING_STYLE_AREA_MIN_POINTS) {
    applyBuildingsLayerStyle(savedBuildingStyleAreaPath);
    return;
  }
  // 加一点经纬度缓冲，让管线范围边缘外的楼块也能保持同一视觉样式。
  var padding = 0.012;
  var minLng = projected.bounds.minLng - padding;
  var minLat = projected.bounds.minLat - padding;
  var maxLng = projected.bounds.maxLng + padding;
  var maxLat = projected.bounds.maxLat + padding;
  var stylePath = [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat]
  ];
  applyBuildingsLayerStyle(stylePath);
}

function applyBuildingsLayerStyle(stylePath){
  if (!buildingsLayer || typeof buildingsLayer.setStyle !== 'function') return;
  var roofColor = normalizeCssColor(mapStyleConfig.buildings.roofColor, DEFAULT_MAP_STYLE_CONFIG.buildings.roofColor);
  var wallColor = normalizeCssColor(mapStyleConfig.buildings.wallColor, DEFAULT_MAP_STYLE_CONFIG.buildings.wallColor);
  buildingsLayer.setStyle({
    // 只保留范围内楼块，范围外模型隐藏不显示。
    hideWithoutStyle: true,
    areas: [{
      // AMap Buildings 中 color1 通常用于楼顶/上表面，color2 用于墙面/侧面。
      color1: roofColor,
      color2: wallColor,
      // 覆盖当前 DXF 管线范围及其缓冲区的矩形。
      path: stylePath
    }]
  });
  updateBuildingStyleAreaOverlay(stylePath);
}

function updateBuildingStyleAreaOverlay(stylePath){
  // 这个面只是把 AMap.Buildings setStyle 的生效范围可视化，
  // 类似官方示例底部框选出的色块，不参与定位和管线渲染。
  clearBuildingStyleAreaOverlay();
  if (!map || !AMap.Polygon || !stylePath || !stylePath.length) return;
  updateBuildingStyleOutsideOverlay(stylePath);
  var fillColor = parseCssColor(mapStyleConfig.area.fillColor, DEFAULT_MAP_STYLE_CONFIG.area.fillColor);
  var strokeColor = parseCssColor(mapStyleConfig.area.strokeColor, DEFAULT_MAP_STYLE_CONFIG.area.strokeColor);
  buildingStyleAreaOverlay = new AMap.Polygon({
    path: stylePath,
    bubble: true,
    fillColor: fillColor.hex,
    fillOpacity: fillColor.alpha,
    strokeColor: strokeColor.hex,
    strokeOpacity: strokeColor.alpha,
    strokeWeight: mapStyleConfig.area.strokeWeight,
    zIndex: getLayerZIndex('area')
  });
  map.add(buildingStyleAreaOverlay);
}

function updateBuildingStyleOutsideOverlay(stylePath){
  clearBuildingStyleOutsideOverlay();
  if (!map || !AMap.Polygon || !stylePath || stylePath.length < BUILDING_STYLE_AREA_MIN_POINTS) return;
  var outsideColor = parseCssColor(mapStyleConfig.area.outsideFillColor, DEFAULT_MAP_STYLE_CONFIG.area.outsideFillColor);
  buildingStyleOutsideOverlay = new AMap.Polygon({
    path: [
      getOutsideMaskOuterPath(stylePath),
      stylePath
    ],
    bubble: true,
    fillColor: outsideColor.hex,
    fillOpacity: outsideColor.alpha,
    strokeOpacity: 0,
    strokeWeight: 0,
    zIndex: getLayerZIndex('outsideMask')
  });
  map.add(buildingStyleOutsideOverlay);
}

function getOutsideMaskOuterPath(innerPath){
  var bounds = getPathBounds(innerPath);
  var lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.01);
  var latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.01);
  var padding = Math.max(lngSpan, latSpan, 0.02) * 2.5;
  return [
    [bounds.minLng - padding, bounds.minLat - padding],
    [bounds.maxLng + padding, bounds.minLat - padding],
    [bounds.maxLng + padding, bounds.maxLat + padding],
    [bounds.minLng - padding, bounds.maxLat + padding]
  ];
}

function getPathBounds(path){
  return path.reduce(function(bounds, point){
    bounds.minLng = Math.min(bounds.minLng, point[0]);
    bounds.minLat = Math.min(bounds.minLat, point[1]);
    bounds.maxLng = Math.max(bounds.maxLng, point[0]);
    bounds.maxLat = Math.max(bounds.maxLat, point[1]);
    return bounds;
  }, {
    minLng: Infinity,
    minLat: Infinity,
    maxLng: -Infinity,
    maxLat: -Infinity
  });
}

function rebuildBuildingsLayer(){
  if (buildingsLayer && map) {
    try {
      map.remove(buildingsLayer);
    } catch (error) {
      console.warn('Failed to remove Buildings layer', error);
    }
  }
  buildingsLayer = null;
  addBuildingsLayer();
}

function clearBuildingStyleAreaOverlay(){
  clearBuildingStyleOutsideOverlay();
  if (!buildingStyleAreaOverlay || !map) return;
  map.remove(buildingStyleAreaOverlay);
  buildingStyleAreaOverlay = null;
}

function clearBuildingStyleOutsideOverlay(){
  if (!buildingStyleOutsideOverlay || !map) return;
  map.remove(buildingStyleOutsideOverlay);
  buildingStyleOutsideOverlay = null;
}

async function loadMapStyleConfig(){
  try {
    var response = await fetch(MAP_STYLE_CONFIG_API, {cache: 'no-store'});
    if (!response.ok) throw new Error('HTTP ' + response.status);
    var result = await response.json();
    if (!result.ok) throw new Error(result.error || '读取配置失败');
    setMapStyleConfig(result.config);
    setStatus('已读取本地样式配置: config/map3d-style.json');
  } catch (error) {
    console.warn('Failed to load map style config', error);
    setMapStyleConfig(DEFAULT_MAP_STYLE_CONFIG);
    setStatus('未读取到本地样式配置；如需保存到 JSON，请通过 npm run serve 打开页面。');
  }
}

function setMapStyleConfig(config){
  var previousBuildingConfig = JSON.stringify(mapStyleConfig.buildings);
  mapStyleConfig = normalizeMapStyleConfig(config);
  savedBuildingStyleAreaPath = mapStyleConfig.area.path;
  currentProjectionId = mapStyleConfig.data.projectionId;
  applyRuntimeStyleConfig();
  updateStyleConfigInputs();
  applyConsoleState();
  applyLayerZIndexConfig();
  if (previousBuildingConfig !== JSON.stringify(mapStyleConfig.buildings)) {
    rebuildBuildingsLayer();
  }
  refreshBuildingsStyleFromCurrentState();
}

async function saveMapStyleConfig(statusMessage){
  flushPendingStyleConfigApply();
  try {
    var response = await fetch(MAP_STYLE_CONFIG_API, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({config: mapStyleConfig})
    });
    var result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || '保存配置失败');
    setMapStyleConfig(result.config);
    setStatus(statusMessage || '样式配置已保存到 config/map3d-style.json');
    return true;
  } catch (error) {
    console.warn('Failed to save map style config', error);
    setStatus('保存失败：请确认页面通过 npm run serve 打开，并检查 config/map3d-style.json 是否可写。');
    return false;
  }
}

function refreshBuildingsStyleFromCurrentState(){
  if (savedBuildingStyleAreaPath.length >= BUILDING_STYLE_AREA_MIN_POINTS) {
    applyBuildingsLayerStyle(savedBuildingStyleAreaPath);
  } else if (currentProjected) {
    updateBuildingsLayerStyle(currentProjected);
  } else {
    clearBuildingStyleAreaOverlay();
  }
}

function getLayerZIndex(name){
  if (mapStyleConfig && mapStyleConfig.layers && Number.isFinite(Number(mapStyleConfig.layers[name]))) {
    return Number(mapStyleConfig.layers[name]);
  }
  return DEFAULT_MAP_STYLE_CONFIG.layers[name];
}

function applyLayerZIndexConfig(){
  setLayerZIndex(satelliteLayer, getLayerZIndex('satellite'));
  setLayerZIndex(roadNetLayer, getLayerZIndex('road'));
  setLayerZIndex(buildingStyleOutsideOverlay, getLayerZIndex('outsideMask'));
  setLayerZIndex(buildingStyleAreaOverlay, getLayerZIndex('area'));
  setLayerZIndex(buildingsLayer, getLayerZIndex('model'));
  setLayerZIndex(dxfThreeLayer, getLayerZIndex('pipeline'));
  refreshPipelineFitOverlayZIndexes();
  refreshValveLayerZIndexes();
}

function setLayerZIndex(layer, zIndex){
  if (!layer) return;
  if (typeof layer.setzIndex === 'function') {
    layer.setzIndex(zIndex);
    return;
  }
  if (typeof layer.setZIndex === 'function') {
    layer.setZIndex(zIndex);
    return;
  }
  if (typeof layer.setOptions === 'function') {
    layer.setOptions({zIndex: zIndex});
    return;
  }
  layer.zIndex = zIndex;
}

function refreshPipelineFitOverlayZIndexes(){
  dxfOverlays.forEach(function(overlay){
    if (dxfValveOverlays.indexOf(overlay) !== -1) return;
    setLayerZIndex(overlay, getLayerZIndex('pipeline'));
  });
}

function refreshValveLayerZIndexes(){
  dxfValveOverlays.forEach(function(overlay, index){
    setLayerZIndex(overlay, getLayerZIndex('label') + index);
  });
}

function getCurrentUiConfig(){
  var consoleEl = document.getElementById('mapConsole');
  var activeTab = document.querySelector('.tab-button.active');
  return {
    collapsed: consoleEl ? consoleEl.classList.contains('collapsed') : false,
    activeTab: activeTab ? activeTab.getAttribute('data-tab') : DEFAULT_MAP_STYLE_CONFIG.ui.activeTab,
    detailsOpen: false
  };
}

function getCurrentViewConfig(){
  if (!map) return mapStyleConfig.view || DEFAULT_MAP_STYLE_CONFIG.view;
  return getCurrentMapView();
}

function applyConsoleState(){
  var consoleEl = document.getElementById('mapConsole');
  if (!consoleEl) return;
  consoleEl.classList.toggle('collapsed', mapStyleConfig.ui.collapsed);
  updateConsoleToggleState();
  activateConsoleTab(mapStyleConfig.ui.activeTab, false);
}

function updateConsoleToggleState(){
  var consoleEl = document.getElementById('mapConsole');
  var toggleBtn = document.getElementById('toggleConsoleBtn');
  if (!consoleEl || !toggleBtn) return;
  var collapsed = consoleEl.classList.contains('collapsed');
  toggleBtn.textContent = collapsed ? '›' : '‹';
  toggleBtn.title = collapsed ? '展开面板' : '收起面板';
  toggleBtn.setAttribute('aria-label', toggleBtn.title);
}

function activateConsoleTab(tabName, persist){
  var tab = normalizeChoice(tabName, DEFAULT_MAP_STYLE_CONFIG.ui.activeTab, ['data', 'area', 'style', 'layers', 'export', 'advanced']);
  document.querySelectorAll('.tab-button').forEach(function(button){
    button.classList.toggle('active', button.getAttribute('data-tab') === tab);
  });
  document.querySelectorAll('.tab-panel').forEach(function(panel){
    panel.classList.toggle('active', panel.getAttribute('data-panel') === tab);
  });
  mapStyleConfig.ui.activeTab = tab;
  if (persist) saveMapStyleConfig('面板标签已保存到 config/map3d-style.json');
}

function applyConfiguredView(){
  if (!map) return;
  var view = mapStyleConfig.view;
  if (!view) return;
  if (Array.isArray(view.center) && typeof map.setCenter === 'function') map.setCenter(view.center);
  if (typeof map.setZoom === 'function') map.setZoom(view.zoom);
  if (typeof map.setPitch === 'function') map.setPitch(view.pitch);
  if (typeof map.setRotation === 'function') map.setRotation(view.rotation);
}

function cloneMapStyleConfig(config){
  return JSON.parse(JSON.stringify(config));
}

function normalizeMapStyleConfig(config){
  var source = config && typeof config === 'object' ? config : {};
  var area = source.area || {};
  var buildings = source.buildings || {};
  return {
    area: {
      path: normalizeBuildingStyleAreaPath(area.path),
      fillColor: normalizeCssColor(area.fillColor, DEFAULT_MAP_STYLE_CONFIG.area.fillColor),
      strokeColor: normalizeCssColor(area.strokeColor, DEFAULT_MAP_STYLE_CONFIG.area.strokeColor),
      outsideFillColor: normalizeCssColor(area.outsideFillColor, DEFAULT_MAP_STYLE_CONFIG.area.outsideFillColor),
      strokeWeight: normalizeStrokeWeight(area.strokeWeight)
    },
    buildings: {
      roofColor: normalizeCssColor(buildings.roofColor, DEFAULT_MAP_STYLE_CONFIG.buildings.roofColor),
      wallColor: normalizeCssColor(buildings.wallColor, DEFAULT_MAP_STYLE_CONFIG.buildings.wallColor)
    },
    layers: {
      satellite: normalizeLayerZIndex(source.layers && source.layers.satellite, DEFAULT_MAP_STYLE_CONFIG.layers.satellite),
      road: normalizeLayerZIndex(source.layers && source.layers.road, DEFAULT_MAP_STYLE_CONFIG.layers.road),
      outsideMask: normalizeLayerZIndex(source.layers && source.layers.outsideMask, DEFAULT_MAP_STYLE_CONFIG.layers.outsideMask),
      area: normalizeLayerZIndex(source.layers && source.layers.area, DEFAULT_MAP_STYLE_CONFIG.layers.area),
      model: normalizeLayerZIndex(source.layers && source.layers.model, DEFAULT_MAP_STYLE_CONFIG.layers.model),
      pipeline: normalizeLayerZIndex(source.layers && source.layers.pipeline, DEFAULT_MAP_STYLE_CONFIG.layers.pipeline),
      label: normalizeLayerZIndex(source.layers && source.layers.label, DEFAULT_MAP_STYLE_CONFIG.layers.label)
    },
    ui: {
      collapsed: Boolean(source.ui && source.ui.collapsed),
      activeTab: normalizeChoice(source.ui && source.ui.activeTab, DEFAULT_MAP_STYLE_CONFIG.ui.activeTab, ['data', 'area', 'style', 'layers', 'export', 'advanced']),
      detailsOpen: Boolean(source.ui && source.ui.detailsOpen)
    },
    view: {
      center: normalizeLngLat(source.view && source.view.center, DEFAULT_MAP_STYLE_CONFIG.view.center),
      zoom: normalizeNumber(source.view && source.view.zoom, DEFAULT_MAP_STYLE_CONFIG.view.zoom, 2, 20),
      pitch: normalizeNumber(source.view && source.view.pitch, DEFAULT_MAP_STYLE_CONFIG.view.pitch, 0, 83),
      rotation: normalizeNumber(source.view && source.view.rotation, DEFAULT_MAP_STYLE_CONFIG.view.rotation, -360, 360)
    },
    data: {
      projectionId: normalizeChoice(source.data && source.data.projectionId, DEFAULT_MAP_STYLE_CONFIG.data.projectionId, Object.keys(CRS_DEFS))
    },
    export: {
      width: normalizeInteger(source.export && source.export.width, DEFAULT_MAP_STYLE_CONFIG.export.width, 320, 12000),
      height: normalizeExportHeight(source.export && source.export.width, source.export && source.export.aspectRatio),
      aspectRatio: normalizeChoice(source.export && source.export.aspectRatio, DEFAULT_MAP_STYLE_CONFIG.export.aspectRatio, EXPORT_ASPECT_RATIOS),
      scale: normalizeNumber(source.export && source.export.scale, DEFAULT_MAP_STYLE_CONFIG.export.scale, 1, 8),
      settle: normalizeInteger(source.export && source.export.settle, DEFAULT_MAP_STYLE_CONFIG.export.settle, 0, 180000),
      wait: normalizeInteger(source.export && source.export.wait, DEFAULT_MAP_STYLE_CONFIG.export.wait, 5000, 240000),
      acceleration: normalizeChoice(source.export && source.export.acceleration, DEFAULT_MAP_STYLE_CONFIG.export.acceleration, EXPORT_ACCELERATION_MODES)
    },
    pipeline: {
      color: normalizeCssColor(source.pipeline && source.pipeline.color, DEFAULT_MAP_STYLE_CONFIG.pipeline.color),
      verticalColor: normalizeCssColor(source.pipeline && source.pipeline.verticalColor, DEFAULT_MAP_STYLE_CONFIG.pipeline.verticalColor),
      undergroundColor: normalizeCssColor(source.pipeline && source.pipeline.undergroundColor, DEFAULT_MAP_STYLE_CONFIG.pipeline.undergroundColor),
      radius: normalizeNumber(source.pipeline && source.pipeline.radius, DEFAULT_MAP_STYLE_CONFIG.pipeline.radius, 0.05, 5),
      verticalRadius: normalizeNumber(source.pipeline && source.pipeline.verticalRadius, DEFAULT_MAP_STYLE_CONFIG.pipeline.verticalRadius, 0.05, 5),
      groundSearchRadius: normalizeNumber(source.pipeline && source.pipeline.groundSearchRadius, DEFAULT_MAP_STYLE_CONFIG.pipeline.groundSearchRadius, 0, 5),
      groundOffset: normalizeNumber(source.pipeline && source.pipeline.groundOffset, DEFAULT_MAP_STYLE_CONFIG.pipeline.groundOffset, -20, 20)
    },
    valves: {
      width: normalizeInteger(source.valves && source.valves.width, DEFAULT_MAP_STYLE_CONFIG.valves.width, 12, 80),
      height: normalizeInteger(source.valves && source.valves.height, DEFAULT_MAP_STYLE_CONFIG.valves.height, 16, 100),
      dedupePixelDistance: normalizeInteger(source.valves && source.valves.dedupePixelDistance, DEFAULT_MAP_STYLE_CONFIG.valves.dedupePixelDistance, 0, 120),
      showLabel: Boolean(source.valves && source.valves.showLabel),
      symbolColor: normalizeCssColor(source.valves && source.valves.symbolColor, DEFAULT_MAP_STYLE_CONFIG.valves.symbolColor),
      borderColor: normalizeCssColor(source.valves && source.valves.borderColor, DEFAULT_MAP_STYLE_CONFIG.valves.borderColor),
      accentColor: normalizeCssColor(source.valves && source.valves.accentColor, DEFAULT_MAP_STYLE_CONFIG.valves.accentColor)
    }
  };
}

function normalizeBuildingStyleAreaPath(pathValue){
  if (!Array.isArray(pathValue)) return [];
  return pathValue.reduce(function(points, point){
    if (!Array.isArray(point) || point.length < 2) return points;
    var lng = Number(point[0]);
    var lat = Number(point[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return points;
    points.push([lng, lat]);
    return points;
  }, []);
}

function normalizeCssColor(value, fallback){
  if (typeof value !== 'string') return fallback;
  var color = value.trim();
  if (!color || color.length > 80) return fallback;
  return color;
}

function parseCssColor(value, fallback){
  var color = normalizeCssColor(value, fallback);
  var rgbaMatch = color.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i);
  if (rgbaMatch) {
    return {
      hex: rgbToHex(Number(rgbaMatch[1]), Number(rgbaMatch[2]), Number(rgbaMatch[3])),
      alpha: clampAlpha(rgbaMatch[4] == null ? 1 : Number(rgbaMatch[4]))
    };
  }
  var hexMatch = color.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hexMatch) {
    return parseHexColor(hexMatch[1]);
  }
  if (color !== fallback) return parseCssColor(fallback, DEFAULT_MAP_STYLE_CONFIG.area.fillColor);
  return {hex: '#4fb0c6', alpha: 1};
}

function parseHexColor(hexValue){
  var hex = hexValue.toLowerCase();
  if (hex.length === 3 || hex.length === 4) {
    hex = hex.split('').map(function(char){ return char + char; }).join('');
  }
  var alpha = 1;
  if (hex.length === 8) {
    alpha = parseInt(hex.slice(6, 8), 16) / 255;
    hex = hex.slice(0, 6);
  }
  return {hex: '#' + hex.slice(0, 6), alpha: clampAlpha(alpha)};
}

function rgbToHex(red, green, blue){
  return '#' + [red, green, blue].map(function(value){
    var channel = Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
    return channel.toString(16).padStart(2, '0');
  }).join('');
}

function hexToRgb(hexColor){
  var parsed = parseHexColor(String(hexColor || '#000000').replace(/^#/, ''));
  var hex = parsed.hex.slice(1);
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16)
  ];
}

function clampAlpha(value){
  var alpha = Number(value);
  if (!Number.isFinite(alpha)) return 1;
  return Math.max(0, Math.min(1, alpha));
}

function normalizeStrokeWeight(value){
  var weight = Number(value);
  if (!Number.isFinite(weight)) return DEFAULT_MAP_STYLE_CONFIG.area.strokeWeight;
  return Math.max(0, Math.min(20, weight));
}

function normalizeLayerZIndex(value, fallback){
  var zIndex = Number(value);
  if (!Number.isFinite(zIndex)) return fallback;
  return Math.max(0, Math.min(10000, Math.round(zIndex)));
}

function normalizeNumber(value, fallback, min, max){
  var number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeInteger(value, fallback, min, max){
  return Math.round(normalizeNumber(value, fallback, min, max));
}

function normalizeExportHeight(widthValue, aspectRatioValue){
  var width = normalizeInteger(widthValue, DEFAULT_MAP_STYLE_CONFIG.export.width, 320, 12000);
  var aspectRatio = normalizeChoice(aspectRatioValue, DEFAULT_MAP_STYLE_CONFIG.export.aspectRatio, EXPORT_ASPECT_RATIOS);
  return getExportHeightForRatio(width, aspectRatio);
}

function getExportHeightForRatio(width, aspectRatio){
  var normalizedWidth = normalizeInteger(width, DEFAULT_MAP_STYLE_CONFIG.export.width, 320, 12000);
  if (aspectRatio === '4:3') return normalizeInteger(normalizedWidth * 3 / 4, DEFAULT_MAP_STYLE_CONFIG.export.height, 240, 10000);
  return normalizeInteger(normalizedWidth * 9 / 16, DEFAULT_MAP_STYLE_CONFIG.export.height, 240, 10000);
}

function normalizeChoice(value, fallback, choices){
  return choices.indexOf(value) === -1 ? fallback : value;
}

function normalizeLngLat(value, fallback){
  if (!Array.isArray(value) || value.length < 2) return fallback;
  var lng = Number(value[0]);
  var lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return fallback;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return fallback;
  return [lng, lat];
}

function cssColorToNumber(value, fallback){
  return parseInt(parseCssColor(value, fallback).hex.slice(1), 16);
}

function applyRuntimeStyleConfig(){
  applyPipelineConfig();
  applyValveConfig();
}

function applyPipelineConfig(){
  PIPELINE_3D_STYLE.color = cssColorToNumber(mapStyleConfig.pipeline.color, DEFAULT_MAP_STYLE_CONFIG.pipeline.color);
  PIPELINE_3D_STYLE.verticalColor = cssColorToNumber(mapStyleConfig.pipeline.verticalColor, DEFAULT_MAP_STYLE_CONFIG.pipeline.verticalColor);
  PIPELINE_3D_STYLE.undergroundColor = cssColorToNumber(mapStyleConfig.pipeline.undergroundColor, DEFAULT_MAP_STYLE_CONFIG.pipeline.undergroundColor);
  PIPELINE_3D_STYLE.undergroundOpacity = parseCssColor(mapStyleConfig.pipeline.undergroundColor, DEFAULT_MAP_STYLE_CONFIG.pipeline.undergroundColor).alpha;
  PIPELINE_3D_STYLE.radius = mapStyleConfig.pipeline.radius;
  PIPELINE_3D_STYLE.verticalRadius = mapStyleConfig.pipeline.verticalRadius;
  PIPELINE_3D_STYLE.groundSearchRadius = mapStyleConfig.pipeline.groundSearchRadius;
  PIPELINE_3D_STYLE.groundOffset = mapStyleConfig.pipeline.groundOffset;
}

function applyValveConfig(){
  VALVE_STYLE.width = mapStyleConfig.valves.width;
  VALVE_STYLE.height = mapStyleConfig.valves.height;
  VALVE_STYLE.dedupePixelDistance = mapStyleConfig.valves.dedupePixelDistance;
  VALVE_STYLE.showLabel = mapStyleConfig.valves.showLabel;
  VALVE_STYLE.symbolColor = mapStyleConfig.valves.symbolColor;
  VALVE_STYLE.borderColor = mapStyleConfig.valves.borderColor;
  VALVE_STYLE.accentColor = mapStyleConfig.valves.accentColor;
  if (currentProjected && window.__PIPELINE_3D_READY) renderValveOverlays(currentProjected);
}

function updateStyleConfigInputs(){
  setInputValue('crsSelect', mapStyleConfig.data.projectionId);
  setColorControl('areaFillColorInput', 'areaFillAlphaInput', mapStyleConfig.area.fillColor, DEFAULT_MAP_STYLE_CONFIG.area.fillColor);
  setColorControl('areaOutsideFillColorInput', 'areaOutsideFillAlphaInput', mapStyleConfig.area.outsideFillColor, DEFAULT_MAP_STYLE_CONFIG.area.outsideFillColor);
  setColorControl('areaStrokeColorInput', 'areaStrokeAlphaInput', mapStyleConfig.area.strokeColor, DEFAULT_MAP_STYLE_CONFIG.area.strokeColor);
  setInputValue('areaStrokeWeightInput', String(mapStyleConfig.area.strokeWeight));
  setColorControl('buildingRoofColorInput', 'buildingRoofAlphaInput', mapStyleConfig.buildings.roofColor, DEFAULT_MAP_STYLE_CONFIG.buildings.roofColor);
  setColorControl('buildingWallColorInput', 'buildingWallAlphaInput', mapStyleConfig.buildings.wallColor, DEFAULT_MAP_STYLE_CONFIG.buildings.wallColor);
  setInputValue('satelliteLayerZInput', String(mapStyleConfig.layers.satellite));
  setInputValue('roadLayerZInput', String(mapStyleConfig.layers.road));
  setInputValue('outsideMaskLayerZInput', String(mapStyleConfig.layers.outsideMask));
  setInputValue('areaLayerZInput', String(mapStyleConfig.layers.area));
  setInputValue('modelLayerZInput', String(mapStyleConfig.layers.model));
  setInputValue('pipelineLayerZInput', String(mapStyleConfig.layers.pipeline));
  setInputValue('labelLayerZInput', String(mapStyleConfig.layers.label));
  setInputValue('exportAspectRatioInput', mapStyleConfig.export.aspectRatio);
  setInputValue('exportWidthInput', String(mapStyleConfig.export.width));
  setInputValue('exportHeightInput', String(mapStyleConfig.export.height));
  setInputValue('exportScaleInput', String(mapStyleConfig.export.scale));
  setInputValue('exportSettleInput', String(mapStyleConfig.export.settle));
  setInputValue('exportWaitInput', String(mapStyleConfig.export.wait));
  setInputValue('exportAccelerationInput', mapStyleConfig.export.acceleration);
  setColorControl('pipelineColorInput', 'pipelineAlphaInput', mapStyleConfig.pipeline.color, DEFAULT_MAP_STYLE_CONFIG.pipeline.color);
  setColorControl('pipelineVerticalColorInput', 'pipelineVerticalAlphaInput', mapStyleConfig.pipeline.verticalColor, DEFAULT_MAP_STYLE_CONFIG.pipeline.verticalColor);
  setColorControl('pipelineUndergroundColorInput', 'pipelineUndergroundAlphaInput', mapStyleConfig.pipeline.undergroundColor, DEFAULT_MAP_STYLE_CONFIG.pipeline.undergroundColor);
  setInputValue('pipelineRadiusInput', String(mapStyleConfig.pipeline.radius));
  setInputValue('pipelineVerticalRadiusInput', String(mapStyleConfig.pipeline.verticalRadius));
  setInputValue('pipelineGroundRadiusInput', String(mapStyleConfig.pipeline.groundSearchRadius));
  setInputValue('pipelineGroundOffsetInput', String(mapStyleConfig.pipeline.groundOffset));
  setInputValue('valveWidthInput', String(mapStyleConfig.valves.width));
  setInputValue('valveHeightInput', String(mapStyleConfig.valves.height));
  setInputValue('valveDedupeInput', String(mapStyleConfig.valves.dedupePixelDistance));
  setInputValue('valveShowLabelInput', String(mapStyleConfig.valves.showLabel));
  setColorControl('valveSymbolColorInput', 'valveSymbolAlphaInput', mapStyleConfig.valves.symbolColor, DEFAULT_MAP_STYLE_CONFIG.valves.symbolColor);
  setColorControl('valveBorderColorInput', 'valveBorderAlphaInput', mapStyleConfig.valves.borderColor, DEFAULT_MAP_STYLE_CONFIG.valves.borderColor);
  setColorControl('valveAccentColorInput', 'valveAccentAlphaInput', mapStyleConfig.valves.accentColor, DEFAULT_MAP_STYLE_CONFIG.valves.accentColor);
  updateExportControlsState();
}

function applyStyleConfigFromInputs(){
  pendingStyleConfigTimer = null;
  var previousBuildingConfig = JSON.stringify(mapStyleConfig.buildings);
  var previousLayerConfig = JSON.stringify(mapStyleConfig.layers);
  var previousPipelineConfig = JSON.stringify(mapStyleConfig.pipeline);
  mapStyleConfig = normalizeMapStyleConfig({
    area: {
      path: savedBuildingStyleAreaPath,
      fillColor: getColorControlValue('areaFillColorInput', 'areaFillAlphaInput', DEFAULT_MAP_STYLE_CONFIG.area.fillColor),
      outsideFillColor: getColorControlValue('areaOutsideFillColorInput', 'areaOutsideFillAlphaInput', DEFAULT_MAP_STYLE_CONFIG.area.outsideFillColor),
      strokeColor: getColorControlValue('areaStrokeColorInput', 'areaStrokeAlphaInput', DEFAULT_MAP_STYLE_CONFIG.area.strokeColor),
      strokeWeight: getInputValue('areaStrokeWeightInput', mapStyleConfig.area.strokeWeight)
    },
    buildings: {
      roofColor: getColorControlValue('buildingRoofColorInput', 'buildingRoofAlphaInput', DEFAULT_MAP_STYLE_CONFIG.buildings.roofColor),
      wallColor: getColorControlValue('buildingWallColorInput', 'buildingWallAlphaInput', DEFAULT_MAP_STYLE_CONFIG.buildings.wallColor)
    },
    layers: {
      satellite: getInputValue('satelliteLayerZInput', mapStyleConfig.layers.satellite),
      road: getInputValue('roadLayerZInput', mapStyleConfig.layers.road),
      outsideMask: getInputValue('outsideMaskLayerZInput', mapStyleConfig.layers.outsideMask),
      area: getInputValue('areaLayerZInput', mapStyleConfig.layers.area),
      model: getInputValue('modelLayerZInput', mapStyleConfig.layers.model),
      pipeline: getInputValue('pipelineLayerZInput', mapStyleConfig.layers.pipeline),
      label: getInputValue('labelLayerZInput', mapStyleConfig.layers.label)
    },
    ui: getCurrentUiConfig(),
    view: getCurrentViewConfig(),
    data: {
      projectionId: getInputValue('crsSelect', mapStyleConfig.data.projectionId)
    },
    export: {
      width: getInputValue('exportWidthInput', mapStyleConfig.export.width),
      aspectRatio: getInputValue('exportAspectRatioInput', mapStyleConfig.export.aspectRatio),
      scale: getInputValue('exportScaleInput', mapStyleConfig.export.scale),
      settle: getInputValue('exportSettleInput', mapStyleConfig.export.settle),
      wait: getInputValue('exportWaitInput', mapStyleConfig.export.wait),
      acceleration: getInputValue('exportAccelerationInput', mapStyleConfig.export.acceleration)
    },
    pipeline: {
      color: getColorControlValue('pipelineColorInput', 'pipelineAlphaInput', DEFAULT_MAP_STYLE_CONFIG.pipeline.color),
      verticalColor: getColorControlValue('pipelineVerticalColorInput', 'pipelineVerticalAlphaInput', DEFAULT_MAP_STYLE_CONFIG.pipeline.verticalColor),
      undergroundColor: getColorControlValue('pipelineUndergroundColorInput', 'pipelineUndergroundAlphaInput', DEFAULT_MAP_STYLE_CONFIG.pipeline.undergroundColor),
      radius: getInputValue('pipelineRadiusInput', mapStyleConfig.pipeline.radius),
      verticalRadius: getInputValue('pipelineVerticalRadiusInput', mapStyleConfig.pipeline.verticalRadius),
      groundSearchRadius: getInputValue('pipelineGroundRadiusInput', mapStyleConfig.pipeline.groundSearchRadius),
      groundOffset: getInputValue('pipelineGroundOffsetInput', mapStyleConfig.pipeline.groundOffset)
    },
    valves: {
      width: getInputValue('valveWidthInput', mapStyleConfig.valves.width),
      height: getInputValue('valveHeightInput', mapStyleConfig.valves.height),
      dedupePixelDistance: getInputValue('valveDedupeInput', mapStyleConfig.valves.dedupePixelDistance),
      showLabel: getInputValue('valveShowLabelInput', String(mapStyleConfig.valves.showLabel)) === 'true',
      symbolColor: getColorControlValue('valveSymbolColorInput', 'valveSymbolAlphaInput', DEFAULT_MAP_STYLE_CONFIG.valves.symbolColor),
      borderColor: getColorControlValue('valveBorderColorInput', 'valveBorderAlphaInput', DEFAULT_MAP_STYLE_CONFIG.valves.borderColor),
      accentColor: getColorControlValue('valveAccentColorInput', 'valveAccentAlphaInput', DEFAULT_MAP_STYLE_CONFIG.valves.accentColor)
    }
  });
  savedBuildingStyleAreaPath = mapStyleConfig.area.path;
  currentProjectionId = mapStyleConfig.data.projectionId;
  applyRuntimeStyleConfig();
  if (previousBuildingConfig !== JSON.stringify(mapStyleConfig.buildings)) {
    rebuildBuildingsLayer();
  }
  applyLayerZIndexConfig();
  if (previousLayerConfig !== JSON.stringify(mapStyleConfig.layers)) {
    refreshValveLayerZIndexes();
  }
  if (previousPipelineConfig !== JSON.stringify(mapStyleConfig.pipeline) && currentProjected && window.__PIPELINE_3D_READY) {
    if (currentDxfText && pipelineProjectionInputsChanged(JSON.parse(previousPipelineConfig), mapStyleConfig.pipeline)) {
      currentProjected = getProjectedDxf(currentDxfText, currentProjectionId);
    }
    drawProjectedFeatures(currentProjected, CRS_DEFS[currentProjectionId].label);
  }
  updateStyleConfigInputs();
  refreshBuildingsStyleFromCurrentState();
}

function pipelineProjectionInputsChanged(previous, next){
  return previous.groundSearchRadius !== next.groundSearchRadius ||
    previous.groundOffset !== next.groundOffset;
}

function scheduleStyleConfigApply(){
  if (pendingStyleConfigTimer) {
    window.clearTimeout(pendingStyleConfigTimer);
  }
  pendingStyleConfigTimer = window.setTimeout(applyStyleConfigFromInputs, 180);
}

function flushPendingStyleConfigApply(){
  if (pendingStyleConfigTimer) {
    window.clearTimeout(pendingStyleConfigTimer);
    pendingStyleConfigTimer = null;
  }
  applyStyleConfigFromInputs();
}

function setInputValue(id, value){
  var input = document.getElementById(id);
  if (input) input.value = value;
}

function getInputValue(id, fallback){
  var input = document.getElementById(id);
  return input ? input.value : fallback;
}

function setColorControl(colorInputId, alphaInputId, value, fallback){
  var parsed = parseCssColor(value, fallback);
  setInputValue(colorInputId, parsed.hex);
  setInputValue(alphaInputId, String(parsed.alpha));
}

function getColorControlValue(colorInputId, alphaInputId, fallback){
  var fallbackColor = parseCssColor(fallback, DEFAULT_MAP_STYLE_CONFIG.area.fillColor);
  var hex = getInputValue(colorInputId, fallbackColor.hex);
  var alpha = getInputValue(alphaInputId, fallbackColor.alpha);
  var rgb = hexToRgb(hex);
  return 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + clampAlpha(alpha).toFixed(2) + ')';
}

function getExportPixelInfo(){
  var exportConfig = mapStyleConfig.export || DEFAULT_MAP_STYLE_CONFIG.export;
  var width = Number(exportConfig.width);
  var height = Number(exportConfig.height);
  var scale = Number(exportConfig.scale);
  var pixelWidth = Math.round(width * scale);
  var pixelHeight = Math.round(height * scale);
  var pixelCount = pixelWidth * pixelHeight;
  return {
    pixelWidth: pixelWidth,
    pixelHeight: pixelHeight,
    pixelCount: pixelCount,
    isLarge: pixelCount > EXPORT_WARNING_PIXELS,
    isUnsafe: pixelCount > EXPORT_MAX_PIXELS
  };
}

function formatPixelCount(value){
  return Math.round(value / 1000000) + 'MP';
}

function updateExportControlsState(){
  var exportPosterBtn = document.getElementById('exportPosterBtn');
  var pixelInfo = getExportPixelInfo();
  if (exportPosterBtn) {
    exportPosterBtn.disabled = isPosterExporting || pixelInfo.isUnsafe;
    exportPosterBtn.textContent = isPosterExporting ? '导出中...' : '导出高清图';
  }
  updateExportResolutionNotice(pixelInfo);
}

function updateExportResolutionNotice(pixelInfo){
  var notice = document.getElementById('exportPixelNotice');
  if (!notice) return;
  var info = pixelInfo || getExportPixelInfo();
  var message = info.pixelWidth + ' x ' + info.pixelHeight + '，约 ' + formatPixelCount(info.pixelCount);
  if (info.isUnsafe) {
    message += '，超过安全上限，请降低宽高或倍率';
  } else if (info.isLarge) {
    message += '，编码可能较慢';
  }
  notice.textContent = message;
  notice.classList.toggle('danger', info.isUnsafe);
  notice.classList.toggle('warning', info.isLarge && !info.isUnsafe);
}

function readViewFromUrl(){
  var params = new URLSearchParams(window.location.search);
  var center = VIEW_PRESET.center;
  var centerParam = params.get('center');
  if (centerParam) {
    var parts = centerParam.split(',').map(Number);
    center = normalizeLngLat(parts, VIEW_PRESET.center);
  }
  return {
    center: center,
    zoom: normalizeNumber(readNumberParam(params, 'zoom', VIEW_PRESET.zoom), VIEW_PRESET.zoom, 2, 20),
    pitch: normalizeNumber(readNumberParam(params, 'pitch', VIEW_PRESET.pitch), VIEW_PRESET.pitch, 0, 83),
    rotation: normalizeNumber(readNumberParam(params, 'rotation', VIEW_PRESET.rotation), VIEW_PRESET.rotation, -360, 360)
  };
}

function readNumberParam(params, name, fallback){
  var value = Number(params.get(name));
  return Number.isFinite(value) ? value : fallback;
}

function initExportHotkeys(){
  document.addEventListener('keydown', function(event){
    if (!(event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'e')) return;
    event.preventDefault();
    exportCurrentPosterView();
  });
}

async function exportCurrentPosterView(){
  if (!map || isPosterExporting) return;
  applyStyleConfigFromInputs();
  var pixelInfo = getExportPixelInfo();
  if (pixelInfo.isUnsafe) {
    setStatus('导出尺寸超过安全上限，请降低宽高或倍率。');
    updateExportControlsState();
    return;
  }
  var view = getCurrentMapView();
  var reachedServer = false;
  isPosterExporting = true;
  updateExportControlsState();
  setStatus('正在导出当前视角高清图，请稍候...');
  try {
    var response = await fetch('/api/export-current-view', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        view: view,
        sourceViewport: getCurrentMapViewport(),
        width: mapStyleConfig.export.width,
        height: mapStyleConfig.export.height,
        aspectRatio: mapStyleConfig.export.aspectRatio,
        scale: mapStyleConfig.export.scale,
        settle: mapStyleConfig.export.settle,
        wait: mapStyleConfig.export.wait,
        acceleration: mapStyleConfig.export.acceleration
      })
    });
    reachedServer = true;
    var result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || '导出失败');
    }
    var seconds = result.timings && Number.isFinite(Number(result.timings.total)) ?
      '，耗时 ' + (result.timings.total / 1000).toFixed(1) + 's' :
      '';
    var fallback = result.fallbackFrom ? '，GPU 已降级' : '';
    var factor = Number(result.deviceScaleFactor);
    var factorInfo = Number.isFinite(factor) ? '，自动倍率 ' + factor.toFixed(2) + 'x' : '';
    setStatus('已导出高清图: ' + result.file + seconds + fallback + factorInfo);
  } catch (error) {
    console.warn(error);
    if (!reachedServer) {
      setStatus('快捷键导出需要先运行 npm run serve。当前视角已写入地址参数，可用导出命令手动导出。');
      updateUrlWithCurrentView(view);
    } else {
      setStatus('导出失败：' + error.message);
    }
  } finally {
    isPosterExporting = false;
    updateExportControlsState();
  }
}

function getCurrentMapView(){
  var center = map.getCenter();
  return {
    center: [center.lng, center.lat],
    zoom: typeof map.getZoom === 'function' ? map.getZoom() : VIEW_PRESET.zoom,
    pitch: typeof map.getPitch === 'function' ? map.getPitch() : VIEW_PRESET.pitch,
    rotation: typeof map.getRotation === 'function' ? map.getRotation() : VIEW_PRESET.rotation
  };
}

function getCurrentMapViewport(){
  var container = document.getElementById('container');
  var rect = container && typeof container.getBoundingClientRect === 'function' ?
    container.getBoundingClientRect() :
    null;
  var visualViewport = window.visualViewport || null;
  var width = rect && rect.width > 0 ?
    rect.width :
    (visualViewport && visualViewport.width > 0 ? visualViewport.width : window.innerWidth);
  var height = rect && rect.height > 0 ?
    rect.height :
    (visualViewport && visualViewport.height > 0 ? visualViewport.height : window.innerHeight);
  return {
    width: Math.round(width),
    height: Math.round(height),
    cssWidth: Math.round(width),
    cssHeight: Math.round(height),
    devicePixelRatio: Number.isFinite(Number(window.devicePixelRatio)) ? Number(window.devicePixelRatio) : 1,
    container: rect ? {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      left: Math.round(rect.left),
      top: Math.round(rect.top)
    } : null,
    window: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight
    },
    visualViewport: visualViewport ? {
      width: Math.round(visualViewport.width),
      height: Math.round(visualViewport.height),
      scale: visualViewport.scale,
      offsetLeft: Math.round(visualViewport.offsetLeft),
      offsetTop: Math.round(visualViewport.offsetTop)
    } : null
  };
}

function updateUrlWithCurrentView(view){
  var params = new URLSearchParams(window.location.search);
  if (POSTER_MODE) params.set('poster', '1');
  params.set('center', view.center[0].toFixed(8) + ',' + view.center[1].toFixed(8));
  params.set('zoom', String(view.zoom));
  params.set('pitch', String(view.pitch));
  params.set('rotation', String(view.rotation));
  history.replaceState(null, '', window.location.pathname + '?' + params.toString());
}

function registerProjectionDefs(){
  Object.keys(CRS_DEFS).forEach(function(key){
    proj4.defs(key, CRS_DEFS[key].definition);
  });
}

function initPipelineTools(){
  var loadBtn = document.getElementById('loadDxfBtn');
  var pickBtn = document.getElementById('pickDxfBtn');
  var fileInput = document.getElementById('dxfFileInput');
  var crsSelect = document.getElementById('crsSelect');
  var fitBtn = document.getElementById('fitPipelineBtn');
  var drawBuildingAreaBtn = document.getElementById('drawBuildingAreaBtn');
  var saveBuildingAreaBtn = document.getElementById('saveBuildingAreaBtn');
  var clearBuildingAreaBtn = document.getElementById('clearBuildingAreaBtn');
  var saveStyleConfigBtn = document.getElementById('saveStyleConfigBtn');
  var exportPosterBtn = document.getElementById('exportPosterBtn');
  var toggleConsoleBtn = document.getElementById('toggleConsoleBtn');

  crsSelect.value = currentProjectionId;

  loadBtn.addEventListener('click', function(){
    if (currentDxfText) {
      renderDxfText(currentDxfText, currentProjectionId);
      return;
    }
    loadDefaultDxf();
  });

  pickBtn.addEventListener('click', function(){
    fileInput.click();
  });

  fileInput.addEventListener('change', function(event){
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    readLocalDxfFile(file);
    fileInput.value = '';
  });

  crsSelect.addEventListener('change', function(event){
    currentProjectionId = event.target.value;
    if (!currentDxfText) return;
    renderDxfText(currentDxfText, currentProjectionId);
  });

  fitBtn.addEventListener('click', fitPipelineView);

  drawBuildingAreaBtn.addEventListener('click', toggleBuildingStyleAreaDrawing);
  saveBuildingAreaBtn.addEventListener('click', finishBuildingStyleAreaDrawing);
  clearBuildingAreaBtn.addEventListener('click', clearManualBuildingStyleArea);
  saveStyleConfigBtn.addEventListener('click', function(){
    saveMapStyleConfig('样式配置已保存到 config/map3d-style.json');
  });
  exportPosterBtn.addEventListener('click', exportCurrentPosterView);
  initExportPresetControls();
  toggleConsoleBtn.addEventListener('click', function(){
    var consoleEl = document.getElementById('mapConsole');
    consoleEl.classList.toggle('collapsed');
    mapStyleConfig.ui.collapsed = consoleEl.classList.contains('collapsed');
    updateConsoleToggleState();
  });
  document.querySelectorAll('.tab-button').forEach(function(button){
    button.addEventListener('click', function(){
      activateConsoleTab(button.getAttribute('data-tab'), false);
    });
  });
  initStyleConfigInputEvents();
  map.on('click', handleBuildingStyleAreaMapClick);
  updateStyleConfigInputs();
  updateBuildingStyleAreaToolState();
}

function initExportPresetControls(){
  document.querySelectorAll('[data-export-preset]').forEach(function(button){
    button.addEventListener('click', function(){
      applyExportPreset(button.getAttribute('data-export-preset'));
    });
  });
}

function applyExportPreset(name){
  var preset = EXPORT_PRESETS[name];
  if (!preset) return;
  setInputValue('exportWidthInput', String(preset.width));
  setInputValue('exportAspectRatioInput', preset.aspectRatio);
  setInputValue('exportHeightInput', String(getExportHeightForRatio(preset.width, preset.aspectRatio)));
  setInputValue('exportScaleInput', String(preset.scale));
  setInputValue('exportSettleInput', String(preset.settle));
  setInputValue('exportWaitInput', String(preset.wait));
  setInputValue('exportAccelerationInput', preset.acceleration);
  applyStyleConfigFromInputs();
  setStatus('已应用导出预设：' + preset.label);
}

function initStyleConfigInputEvents(){
  [
    'areaFillColorInput',
    'areaFillAlphaInput',
    'areaOutsideFillColorInput',
    'areaOutsideFillAlphaInput',
    'areaStrokeColorInput',
    'areaStrokeAlphaInput',
    'areaStrokeWeightInput',
    'buildingRoofColorInput',
    'buildingRoofAlphaInput',
    'buildingWallColorInput',
    'buildingWallAlphaInput',
    'satelliteLayerZInput',
    'roadLayerZInput',
    'outsideMaskLayerZInput',
    'areaLayerZInput',
    'modelLayerZInput',
    'pipelineLayerZInput',
    'labelLayerZInput',
    'exportAspectRatioInput',
    'exportWidthInput',
    'exportScaleInput',
    'exportSettleInput',
    'exportWaitInput',
    'exportAccelerationInput',
    'pipelineColorInput',
    'pipelineAlphaInput',
    'pipelineVerticalColorInput',
    'pipelineVerticalAlphaInput',
    'pipelineUndergroundColorInput',
    'pipelineUndergroundAlphaInput',
    'pipelineRadiusInput',
    'pipelineVerticalRadiusInput',
    'pipelineGroundRadiusInput',
    'pipelineGroundOffsetInput',
    'valveWidthInput',
    'valveHeightInput',
    'valveDedupeInput',
    'valveShowLabelInput',
    'valveSymbolColorInput',
    'valveSymbolAlphaInput',
    'valveBorderColorInput',
    'valveBorderAlphaInput',
    'valveAccentColorInput',
    'valveAccentAlphaInput'
  ].forEach(function(id){
    var input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', scheduleStyleConfigApply);
  });
}

function toggleBuildingStyleAreaDrawing(){
  if (isDrawingBuildingStyleArea) {
    cancelBuildingStyleAreaDrawing();
    return;
  }
  isDrawingBuildingStyleArea = true;
  draftBuildingStyleAreaPath = [];
  clearBuildingStyleAreaOverlay();
  updateBuildingStyleAreaToolState();
  setStatus('正在绘制楼块范围：请在地图上依次点击范围边界点，至少 3 个点后点击“保存范围”。');
}

function handleBuildingStyleAreaMapClick(event){
  if (!isDrawingBuildingStyleArea || !event || !event.lnglat) return;
  var lnglat = event.lnglat;
  var lng = typeof lnglat.getLng === 'function' ? lnglat.getLng() : lnglat.lng;
  var lat = typeof lnglat.getLat === 'function' ? lnglat.getLat() : lnglat.lat;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
  draftBuildingStyleAreaPath.push([lng, lat]);
  if (draftBuildingStyleAreaPath.length >= BUILDING_STYLE_AREA_MIN_POINTS) {
    updateBuildingStyleAreaOverlay(draftBuildingStyleAreaPath);
  }
  updateBuildingStyleAreaToolState();
  setStatus('楼块范围已添加 ' + draftBuildingStyleAreaPath.length + ' 个点；至少 3 个点后可保存。');
}

async function finishBuildingStyleAreaDrawing(){
  if (!isDrawingBuildingStyleArea || draftBuildingStyleAreaPath.length < BUILDING_STYLE_AREA_MIN_POINTS) {
    setStatus('楼块范围至少需要 3 个点。');
    return;
  }
  applyStyleConfigFromInputs();
  mapStyleConfig.area.path = normalizeBuildingStyleAreaPath(draftBuildingStyleAreaPath);
  savedBuildingStyleAreaPath = mapStyleConfig.area.path;
  applyBuildingsLayerStyle(savedBuildingStyleAreaPath);
  if (await saveMapStyleConfig('楼块范围已保存到 config/map3d-style.json，刷新或重启后会自动恢复。')) {
    isDrawingBuildingStyleArea = false;
    draftBuildingStyleAreaPath = [];
    updateBuildingStyleAreaToolState();
  }
}

function cancelBuildingStyleAreaDrawing(){
  isDrawingBuildingStyleArea = false;
  draftBuildingStyleAreaPath = [];
  if (savedBuildingStyleAreaPath.length >= BUILDING_STYLE_AREA_MIN_POINTS) {
    applyBuildingsLayerStyle(savedBuildingStyleAreaPath);
  } else if (currentProjected) {
    updateBuildingsLayerStyle(currentProjected);
  } else {
    clearBuildingStyleAreaOverlay();
  }
  updateBuildingStyleAreaToolState();
  setStatus('已取消绘制楼块范围。');
}

async function clearManualBuildingStyleArea(){
  isDrawingBuildingStyleArea = false;
  draftBuildingStyleAreaPath = [];
  applyStyleConfigFromInputs();
  mapStyleConfig.area.path = [];
  savedBuildingStyleAreaPath = [];
  if (currentProjected) {
    updateBuildingsLayerStyle(currentProjected);
  } else {
    clearBuildingStyleAreaOverlay();
    if (buildingsLayer && typeof buildingsLayer.setStyle === 'function') {
      buildingsLayer.setStyle({hideWithoutStyle: true, areas: []});
    }
  }
  await saveMapStyleConfig('已清除手动楼块范围并保存，恢复 DXF 自动范围。');
  updateBuildingStyleAreaToolState();
}

function updateBuildingStyleAreaToolState(){
  var drawBuildingAreaBtn = document.getElementById('drawBuildingAreaBtn');
  var saveBuildingAreaBtn = document.getElementById('saveBuildingAreaBtn');
  var clearBuildingAreaBtn = document.getElementById('clearBuildingAreaBtn');
  if (!drawBuildingAreaBtn || !saveBuildingAreaBtn || !clearBuildingAreaBtn) return;
  drawBuildingAreaBtn.textContent = isDrawingBuildingStyleArea ? '取消绘制' : '绘制楼块范围';
  saveBuildingAreaBtn.disabled = !isDrawingBuildingStyleArea ||
    draftBuildingStyleAreaPath.length < BUILDING_STYLE_AREA_MIN_POINTS;
  clearBuildingAreaBtn.disabled = isDrawingBuildingStyleArea && !savedBuildingStyleAreaPath.length;
}

async function loadDefaultDxf(){
  setStatus('正在加载 ' + DXF_FILE_NAME + ' ...');
  updateExportReadyState({dxf: false, pipeline3d: false, valves: false});
  try {
    var response = await fetch(encodeURI(DXF_FILE_NAME));
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
    currentDxfText = decodeDxfBuffer(await response.arrayBuffer());
    renderDxfText(currentDxfText, currentProjectionId);
  } catch (error) {
    console.warn(error);
    currentDxfText = '';
    setStats('未加载');
    document.getElementById('fitPipelineBtn').disabled = true;
    updateExportReadyState({dxf: false, pipeline3d: false, valves: false});
    setStatus('自动加载失败。若页面是本地直开，请点击“选择本地 DXF”手动导入。');
  }
}

function decodeDxfBuffer(buffer){
  if (!window.TextDecoder) {
    return '';
  }

  for (var i = 0; i < DXF_TEXT_ENCODINGS.length; i += 1) {
    try {
      var text = new TextDecoder(DXF_TEXT_ENCODINGS[i]).decode(buffer);
      if (isReadableDxfText(text)) return text;
    } catch (error) {
      // Try the next browser-supported encoding.
    }
  }

  return new TextDecoder().decode(buffer);
}

function isReadableDxfText(text){
  return text.indexOf('SECTION') !== -1 && text.indexOf('ENTITIES') !== -1;
}

function readLocalDxfFile(file){
  setStatus('正在读取本地 DXF: ' + file.name);
  var reader = new FileReader();
  reader.onload = function(){
    currentDxfText = decodeDxfBuffer(reader.result);
    renderDxfText(currentDxfText, currentProjectionId);
  };
  reader.onerror = function(){
    console.warn(reader.error);
    setStatus('读取本地 DXF 失败，请重试');
  };
  reader.readAsArrayBuffer(file);
}

function renderDxfText(dxfText, projectionId){
  if (!dxfText) {
    updateExportReadyState({dxf: false, pipeline3d: false, valves: false});
    setStatus('DXF 内容为空');
    return;
  }

  var projection = CRS_DEFS[projectionId];

  if (!projection) {
    updateExportReadyState({dxf: false, pipeline3d: false, valves: false});
    setStatus('未找到坐标系定义: ' + projectionId);
    return;
  }

  var projected = getProjectedDxf(dxfText, projectionId);
  if (!projected.features.length) {
    clearDxfOverlays();
    setStats('0 条管线');
    document.getElementById('fitPipelineBtn').disabled = true;
    updateExportReadyState({dxf: false, pipeline3d: false, valves: false});
    setStatus('未解析出可绘制的线性实体');
    return;
  }

  document.getElementById('fitPipelineBtn').disabled = false;
  setStats(formatProjectedStats(projected));
  setStatus('正在渲染三维管线，坐标系: ' + projection.label + ' ...');
  updateBuildingsLayerStyle(projected);
  drawProjectedFeatures(projected, projection.label);
}

function getProjectedDxf(dxfText, projectionId){
  if (dxfProcessingCache.text !== dxfText) {
    var parsed = parseDxf(dxfText);
    dxfProcessingCache = {
      text: dxfText,
      parsed: parsed,
      mergedFeatures: mergeLinearFeatures(parsed.features, SEGMENT_MERGE_TOLERANCE),
      projectedByKey: {}
    };
  }

  var key = getProjectedDxfCacheKey(projectionId);
  if (!dxfProcessingCache.projectedByKey[key]) {
    dxfProcessingCache.projectedByKey[key] = projectFeatures(
      dxfProcessingCache.mergedFeatures,
      dxfProcessingCache.parsed.inserts,
      projectionId
    );
  }
  return dxfProcessingCache.projectedByKey[key];
}

function getProjectedDxfCacheKey(projectionId){
  return [
    projectionId,
    PIPELINE_3D_STYLE.groundSearchRadius,
    PIPELINE_3D_STYLE.groundOffset,
    PIPELINE_3D_STYLE.heightScale
  ].join('|');
}

function parseDxf(dxfText){
  var lines = dxfText.replace(/\u0000/g, '').split(/\r?\n/);
  var pairs = [];
  for (var i = 0; i < lines.length; i += 2) {
    pairs.push({
      code: (lines[i] || '').trim(),
      value: lines[i + 1] == null ? '' : String(lines[i + 1]).trim()
    });
  }

  var features = [];
  var inserts = [];
  var inEntities = false;
  var entity = null;
  var polylineBuffer = null;

  for (var index = 0; index < pairs.length; index++) {
    var pair = pairs[index];

    if (pair.code === '0' && pair.value === 'SECTION' && pairs[index + 1] && pairs[index + 1].code === '2') {
      inEntities = pairs[index + 1].value === 'ENTITIES';
      entity = null;
      polylineBuffer = null;
      continue;
    }

    if (!inEntities) continue;

    if (pair.code === '0' && pair.value === 'ENDSEC') {
      finalizeOpenEntities(features, inserts, entity, polylineBuffer);
      break;
    }

    if (pair.code === '0') {
      if (pair.value === 'VERTEX' && polylineBuffer) {
        var vertex = consumeVertexEntity(pairs, index + 1);
        if (vertex.point) {
          polylineBuffer.points.push(vertex.point);
        }
        index = vertex.nextIndex - 1;
        continue;
      }

      if (pair.value === 'SEQEND') {
        if (polylineBuffer && polylineBuffer.points.length >= 2) {
          if (polylineBuffer.closed) {
            closePoints(polylineBuffer.points);
          }
          features.push(makeFeature(polylineBuffer.layer, polylineBuffer.points, 'POLYLINE'));
        }
        polylineBuffer = null;
        continue;
      }

      if (entity) {
        pushFeatureFromEntity(features, inserts, entity);
      }

      entity = {
        type: pair.value,
        data: {}
      };

      if (pair.value === 'POLYLINE') {
        polylineBuffer = {
          layer: '',
          points: [],
          closed: false
        };
      }
      continue;
    }

    if (!entity) continue;

    if (polylineBuffer && entity.type === 'POLYLINE') {
      if (pair.code === '8') {
        polylineBuffer.layer = pair.value || '';
      } else if (pair.code === '70') {
        polylineBuffer.closed = (toNumber(pair.value) & 1) === 1;
      }
      continue;
    }

    if (!entity.data[pair.code]) {
      entity.data[pair.code] = [];
    }
    entity.data[pair.code].push(pair.value);
  }

  return {
    features: features,
    inserts: inserts
  };
}

function finalizeOpenEntities(features, inserts, entity, polylineBuffer){
  if (entity) {
    pushFeatureFromEntity(features, inserts, entity);
  }
  if (polylineBuffer && polylineBuffer.points.length >= 2) {
    if (polylineBuffer.closed) {
      closePoints(polylineBuffer.points);
    }
    features.push(makeFeature(polylineBuffer.layer, polylineBuffer.points, 'POLYLINE'));
  }
}

function consumeVertexEntity(pairs, startIndex){
  var point = null;
  var x = null;
  var y = null;
  var z = 0;
  var cursor = startIndex;

  while (cursor < pairs.length) {
    var pair = pairs[cursor];
    if (pair.code === '0') break;
    if (pair.code === '10') x = toNumber(pair.value);
    if (pair.code === '20') y = toNumber(pair.value);
    if (pair.code === '30') z = toNumber(pair.value);
    cursor += 1;
  }

  if (Number.isFinite(x) && Number.isFinite(y)) {
    point = makePoint(x, y, z);
  }

  return {
    point: point,
    nextIndex: cursor
  };
}

function pushFeatureFromEntity(features, inserts, entity){
  var type = entity.type;
  if (type === 'LINE' || type === 'TRLINE') {
    var linePoints = [
      makePoint(firstNumber(entity.data['10']), firstNumber(entity.data['20']), firstNumber(entity.data['30'])),
      makePoint(firstNumber(entity.data['11']), firstNumber(entity.data['21']), firstNumber(entity.data['31']))
    ];
    if (isValidPoint(linePoints[0]) && isValidPoint(linePoints[1])) {
      features.push(makeFeature(firstValue(entity.data['8']), linePoints, type));
    }
    return;
  }

  if (type === 'INSERT') {
    var insertPoint = makePoint(firstNumber(entity.data['10']), firstNumber(entity.data['20']), firstNumber(entity.data['30']));
    if (isValidPoint(insertPoint)) {
      inserts.push({
        layer: firstValue(entity.data['8']) || '0',
        name: firstValue(entity.data['2']) || '',
        rotation: firstNumber(entity.data['50']) || 0,
        point: insertPoint
      });
    }
    return;
  }

  if (type === 'LWPOLYLINE') {
    var xs = entity.data['10'] || [];
    var ys = entity.data['20'] || [];
    var points = [];
    var elevation = firstNumber(entity.data['38']);
    var z = Number.isFinite(elevation) ? elevation : 0;
    for (var i = 0; i < Math.min(xs.length, ys.length); i += 1) {
      var point = makePoint(toNumber(xs[i]), toNumber(ys[i]), z);
      if (isValidPoint(point)) {
        points.push(point);
      }
    }
    if (points.length >= 2) {
      var flags = firstNumber(entity.data['70']);
      if ((flags & 1) === 1) {
        closePoints(points);
      }
      features.push(makeFeature(firstValue(entity.data['8']), points, type));
    }
  }
}

function makeFeature(layerName, points, type){
  return {
    layer: layerName || '0',
    type: type,
    points: points,
    closed: isClosedPath(points)
  };
}

function isClosedPath(points){
  if (!points || points.length < 3) return false;
  var first = points[0];
  var last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1] && normalizeZ(first[2]) === normalizeZ(last[2]);
}

function closePoints(points){
  var first = points[0];
  var last = points[points.length - 1];
  if (!first || !last) return;
  if (first[0] !== last[0] || first[1] !== last[1] || normalizeZ(first[2]) !== normalizeZ(last[2])) {
    points.push(makePoint(first[0], first[1], first[2]));
  }
}

function mergeLinearFeatures(features, tolerance){
  var grouped = {};
  var merged = [];

  features.forEach(function(feature){
    if (feature.closed || feature.points.length < 2) {
      merged.push(feature);
      return;
    }
    var groupKey = feature.layer + '|' + feature.type;
    if (!grouped[groupKey]) grouped[groupKey] = [];
    grouped[groupKey].push(cloneFeature(feature));
  });

  Object.keys(grouped).forEach(function(groupKey){
    var pending = grouped[groupKey].slice();
    while (pending.length) {
      var current = pending.shift();
      var changed = true;
      while (changed) {
        changed = false;
        for (var i = 0; i < pending.length; i += 1) {
          var candidate = pending[i];
          var joined = tryMergeFeaturePair(current, candidate, tolerance);
          if (joined) {
            current = joined;
            pending.splice(i, 1);
            changed = true;
            break;
          }
        }
      }
      merged.push(current);
    }
  });

  return merged;
}

function cloneFeature(feature){
  return {
    layer: feature.layer,
    type: feature.type,
    closed: feature.closed,
    points: feature.points.map(function(point){ return makePoint(point[0], point[1], point[2]); })
  };
}

function tryMergeFeaturePair(left, right, tolerance){
  var leftStart = left.points[0];
  var leftEnd = left.points[left.points.length - 1];
  var rightStart = right.points[0];
  var rightEnd = right.points[right.points.length - 1];

  if (pointsNear(leftEnd, rightStart, tolerance)) {
    return mergedFeature(left, right.points.slice(1));
  }
  if (pointsNear(leftEnd, rightEnd, tolerance)) {
    return mergedFeature(left, reversePoints(right.points).slice(1));
  }
  if (pointsNear(leftStart, rightEnd, tolerance)) {
    return mergedFeature(right, left.points.slice(1));
  }
  if (pointsNear(leftStart, rightStart, tolerance)) {
    return mergedFeature({layer:left.layer, type:left.type, points:reversePoints(right.points), closed:false}, left.points.slice(1));
  }
  return null;
}

function mergedFeature(baseFeature, suffixPoints){
  return {
    layer: baseFeature.layer,
    type: baseFeature.type,
    closed: false,
    points: baseFeature.points.concat(suffixPoints)
  };
}

function reversePoints(points){
  return points.slice().reverse();
}

function pointsNear(a, b, tolerance){
  if (!a || !b) return false;
  var dx = a[0] - b[0];
  var dy = a[1] - b[1];
  var dz = normalizeZ(a[2]) - normalizeZ(b[2]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz) <= tolerance;
}

function projectFeatures(features, inserts, projectionId){
  var projectedFeatures = [];
  var projectedValves = [];
  var minZ = Infinity;
  var maxZ = -Infinity;
  var verticalSegments = 0;
  var touchingGroundSegments = 0;
  var undergroundSegments = 0;
  var crossingGroundSegments = 0;
  var bounds = {
    minLng: Infinity,
    minLat: Infinity,
    maxLng: -Infinity,
    maxLat: -Infinity
  };

  features.forEach(function(feature){
    var path = [];
    feature.points.forEach(function(point){
      var z = normalizeZ(point[2]);
      var lnglat = projectedPointToGcj(point, projectionId);
      if (!lnglat) return;
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      bounds.minLng = Math.min(bounds.minLng, lnglat[0]);
      bounds.minLat = Math.min(bounds.minLat, lnglat[1]);
      bounds.maxLng = Math.max(bounds.maxLng, lnglat[0]);
      bounds.maxLat = Math.max(bounds.maxLat, lnglat[1]);
      path.push({
        lng: lnglat[0],
        lat: lnglat[1],
        x: point[0],
        y: point[1],
        z: z,
        actualHeight: 0,
        height: 0
      });
    });

    if (path.length >= 2) {
      for (var i = 1; i < path.length; i += 1) {
        if (isVerticalSegment(path[i - 1], path[i])) {
          verticalSegments += 1;
        }
      }
      projectedFeatures.push({
        layer: feature.layer,
        type: feature.type,
        path: path
      });
    }
  });

  inserts.forEach(function(insert){
    if (!isValveInsert(insert)) return;
    var z = normalizeZ(insert.point[2]);
    var lnglat = projectedPointToGcj(insert.point, projectionId);
    if (!lnglat) return;
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    projectedValves.push({
      layer: insert.layer,
      name: insert.name,
      rotation: insert.rotation,
      lnglat: lnglat,
      z: z
    });
  });

  var projectedPoints = [];
  projectedFeatures.forEach(function(feature){
    feature.path.forEach(function(point){
      projectedPoints.push(point);
    });
  });

  if (!Number.isFinite(minZ)) minZ = 0;
  if (!Number.isFinite(maxZ)) maxZ = minZ;
  var groundIndex = assignLocalGroundHeights(projectedPoints);
  projectedFeatures.forEach(function(feature){
    feature.path.forEach(function(point){
      point.actualHeight = point.z - point.groundZ;
      point.height = PIPELINE_3D_STYLE.groundOffset + point.actualHeight * PIPELINE_3D_STYLE.heightScale;
    });
    for (var i = 1; i < feature.path.length; i += 1) {
      var startBelow = feature.path[i - 1].height < 0;
      var endBelow = feature.path[i].height < 0;
      if (startBelow && endBelow) {
        undergroundSegments += 1;
      } else if (!startBelow && !endBelow) {
        touchingGroundSegments += 1;
      } else {
        crossingGroundSegments += 1;
      }
    }
  });
  projectedValves.forEach(function(valve){
    valve.groundZ = getLocalGroundZ(valve, groundIndex);
    valve.actualHeight = valve.z - valve.groundZ;
    valve.height = PIPELINE_3D_STYLE.groundOffset + valve.actualHeight * PIPELINE_3D_STYLE.heightScale;
  });

  var minActualHeight = Infinity;
  var maxActualHeight = -Infinity;
  projectedPoints.forEach(function(point){
    minActualHeight = Math.min(minActualHeight, point.actualHeight);
    maxActualHeight = Math.max(maxActualHeight, point.actualHeight);
  });
  if (!Number.isFinite(minActualHeight)) minActualHeight = 0;
  if (!Number.isFinite(maxActualHeight)) maxActualHeight = minActualHeight;

  return {
    features: projectedFeatures,
    valves: projectedValves,
    visibleValveCount: projectedValves.length,
    zRange: {
      min: minZ,
      max: maxZ,
      delta: maxZ - minZ
    },
    verticalSegments: verticalSegments,
    groundSearchRadius: PIPELINE_3D_STYLE.groundSearchRadius,
    relativeGroundRange: {
      min: minActualHeight,
      max: maxActualHeight
    },
    touchingGroundSegments: touchingGroundSegments,
    undergroundSegments: undergroundSegments,
    crossingGroundSegments: crossingGroundSegments,
    bounds: Number.isFinite(bounds.minLng) ? bounds : null
  };
}

function assignLocalGroundHeights(points){
  var groundIndex = createGroundIndex(points);
  points.forEach(function(point){
    point.groundZ = getLocalGroundZ(point, groundIndex);
  });
  return groundIndex;
}

function createGroundIndex(points){
  var radius = PIPELINE_3D_STYLE.groundSearchRadius;
  var cellSize = Math.max(radius, 0.001);
  var buckets = new Map();
  points.forEach(function(point){
    var cell = getGroundCell(point, cellSize);
    var key = cell.x + ',' + cell.y;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(point);
  });
  return {
    buckets: buckets,
    cellSize: cellSize,
    radius: radius
  };
}

function getGroundCell(point, cellSize){
  return {
    x: Math.floor(point.x / cellSize),
    y: Math.floor(point.y / cellSize)
  };
}

function getLocalGroundZ(point, groundIndex){
  var radius = groundIndex.radius;
  var radiusSquared = radius * radius;
  var groundZ = point.z;
  var cell = getGroundCell(point, groundIndex.cellSize);
  for (var x = cell.x - 1; x <= cell.x + 1; x += 1) {
    for (var y = cell.y - 1; y <= cell.y + 1; y += 1) {
      var candidates = groundIndex.buckets.get(x + ',' + y);
      if (!candidates) continue;
      candidates.forEach(function(candidate){
        var dx = point.x - candidate.x;
        var dy = point.y - candidate.y;
        if (dx * dx + dy * dy <= radiusSquared) {
          groundZ = Math.max(groundZ, candidate.z);
        }
      });
    }
  }
  return groundZ;
}

function isValveInsert(insert){
  return VALVE_KEYWORDS.some(function(keyword){
    return insert.name.indexOf(keyword) !== -1;
  });
}

function projectedPointToGcj(point, projectionId){
  try {
    var wgs84 = proj4(projectionId, WGS84, [point[0], point[1]]);
    if (!Array.isArray(wgs84) || wgs84.length < 2) return null;
    if (!isProbablyChinaLngLat(wgs84[0], wgs84[1])) return null;
    return wgs84ToGcj02(wgs84[0], wgs84[1]);
  } catch (error) {
    console.warn('Coordinate transform failed', error);
    return null;
  }
}

function isProbablyChinaLngLat(lng, lat){
  return lng >= 70 && lng <= 140 && lat >= 3 && lat <= 55;
}

function drawProjectedFeatures(projected, projectionLabel){
  clearDxfOverlays();
  window.__PIPELINE_3D_READY = false;
  currentProjected = projected;
  updateExportReadyState({dxf: true, pipeline3d: false, valves: false});

  var fitOverlays = [];
  projected.features.forEach(function(feature){
    fitOverlays.push(new AMap.Polyline({
      path: feature.path.map(pointToLngLat),
      strokeColor: PIPELINE_STYLE.strokeColor,
      strokeOpacity: 0,
      strokeWeight: 1,
      strokeStyle: 'solid',
      lineJoin: PIPELINE_STYLE.lineJoin,
      lineCap: PIPELINE_STYLE.lineCap,
      zIndex: getLayerZIndex('pipeline')
    }));
  });

  dxfOverlays = fitOverlays;
  map.add(fitOverlays);

  var unavailableReason = getPipeline3DUnavailableReason();
  if (unavailableReason) {
    projected.visibleValveCount = 0;
    setStats(formatProjectedStats(projected));
    updateExportReadyState({pipeline3d: false, valves: false});
    setStatus('3D 图层未加载：' + unavailableReason + '。未绘制二维管线 fallback。');
    return;
  }

  renderValveOverlays(projected);

  try {
    dxfThreeLayer = createPipeline3DLayer(projected, projectionLabel);
    map.add(dxfThreeLayer);
    if (typeof map.render === 'function') map.render();
  } catch (error) {
    console.error('Failed to create 3D pipeline layer', error);
    clearValveOverlays();
    projected.visibleValveCount = 0;
    setStats(formatProjectedStats(projected));
    dxfThreeLayer = null;
    dxfThreeState = null;
    updateExportReadyState({pipeline3d: false, valves: false});
    setStatus('3D 图层未加载：' + error.message + '。未绘制二维管线 fallback。');
  }
}

function getPipeline3DUnavailableReason(){
  if (window.__THREE_LOAD_FAILED) return 'Three 本地脚本加载失败';
  if (!window.THREE) return 'THREE 不可用';
  if (!AMap.GLCustomLayer) return 'AMap.GLCustomLayer 不可用';
  if (!map.customCoords) return 'map.customCoords 不可用';
  return '';
}

function initValveRefreshEvents(){
  ['moveend', 'zoomend', 'rotateend', 'pitchend'].forEach(function(eventName){
    map.on(eventName, function(){
      if (!currentProjected || !window.__PIPELINE_3D_READY) return;
      scheduleValveRefresh();
    });
  });
}

function scheduleValveRefresh(){
  if (pendingValveRefreshTimer) {
    window.clearTimeout(pendingValveRefreshTimer);
  }
  updateExportReadyState({valves: false});
  pendingValveRefreshTimer = window.setTimeout(function(){
    pendingValveRefreshTimer = null;
    if (!currentProjected || !window.__PIPELINE_3D_READY) return;
    renderValveOverlays(currentProjected);
    setStats(formatProjectedStats(currentProjected));
    if (dxfThreeState && dxfThreeState.ready) {
      setPipelineReadyStatus(currentProjected, dxfThreeState.projectionLabel);
    }
  }, 160);
}

function renderValveOverlays(projected){
  clearValveOverlays();
  var visibleValves = dedupeValvesByScreenDistance(projected.valves);
  projected.visibleValveCount = visibleValves.length;
  visibleValves.forEach(function(valve){
    dxfValveOverlays.push(createValveSymbol(valve));
    if (VALVE_STYLE.showLabel) {
      dxfValveOverlays.push(createValveLabel(valve));
    }
  });
  if (!dxfValveOverlays.length) {
    updateExportReadyState({valves: true});
    return;
  }
  dxfOverlays = dxfOverlays.concat(dxfValveOverlays);
  map.add(dxfValveOverlays);
  updateExportReadyState({valves: true});
}

function clearValveOverlays(){
  if (!dxfValveOverlays.length) return;
  map.remove(dxfValveOverlays);
  dxfOverlays = dxfOverlays.filter(function(overlay){
    return dxfValveOverlays.indexOf(overlay) === -1;
  });
  dxfValveOverlays = [];
}

function dedupeValvesByScreenDistance(valves){
  var kept = [];
  var cellSize = Math.max(VALVE_STYLE.dedupePixelDistance, 1);
  var keptPixelBuckets = new Map();
  var maxDistanceSquared = VALVE_STYLE.dedupePixelDistance * VALVE_STYLE.dedupePixelDistance;
  valves.forEach(function(valve){
    var pixel = getValveContainerPixel(valve);
    if (!pixel) return;
    var cell = getPixelCell(pixel, cellSize);
    for (var x = cell.x - 1; x <= cell.x + 1; x += 1) {
      for (var y = cell.y - 1; y <= cell.y + 1; y += 1) {
        var candidates = keptPixelBuckets.get(x + ',' + y);
        if (!candidates) continue;
        for (var i = 0; i < candidates.length; i += 1) {
          if (pixelDistanceSquared(pixel, candidates[i]) <= maxDistanceSquared) {
            return;
          }
        }
      }
    }
    kept.push(valve);
    var key = cell.x + ',' + cell.y;
    if (!keptPixelBuckets.has(key)) {
      keptPixelBuckets.set(key, []);
    }
    keptPixelBuckets.get(key).push(pixel);
  });
  return kept;
}

function getPixelCell(pixel, cellSize){
  return {
    x: Math.floor(pixel.x / cellSize),
    y: Math.floor(pixel.y / cellSize)
  };
}

function pixelDistanceSquared(a, b){
  var dx = a.x - b.x;
  var dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function pixelDistance(a, b){
  return Math.sqrt(pixelDistanceSquared(a, b));
}

function getValveContainerPixel(valve){
  if (!map || typeof map.lngLatToContainer !== 'function') return null;
  var pixel = map.lngLatToContainer(valve.lnglat);
  if (!pixel) return null;
  var x = Number.isFinite(pixel.x) ? pixel.x : pixel.getX && pixel.getX();
  var y = Number.isFinite(pixel.y) ? pixel.y : pixel.getY && pixel.getY();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {x: x, y: y};
}

function createPipeline3DLayer(projected, projectionLabel){
  var renderCenter = getPipelineRenderCenter(projected);
  var state = {
    projected: projected,
    projectionLabel: projectionLabel,
    center: renderCenter,
    renderer: null,
    camera: null,
    scene: null,
    customCoords: map.customCoords,
    ready: false
  };
  dxfThreeState = state;

  return new AMap.GLCustomLayer({
    zIndex: getLayerZIndex('pipeline'),
    init: function(gl){
      state.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 100, 1 << 30);
      state.renderer = new THREE.WebGLRenderer({
        context: gl,
        canvas: gl.canvas
      });
      state.renderer.autoClear = false;
      state.scene = new THREE.Scene();
      state.scene.add(new THREE.AmbientLight(0xffffff, 0.72));
      var keyLight = new THREE.DirectionalLight(0xffffff, 0.95);
      keyLight.position.set(900, -500, 1200);
      state.scene.add(keyLight);
      state.customCoords.setCenter(state.center);
      buildPipeline3DScene(state);
    },
    render: function(){
      if (!state.renderer || !state.camera || !state.scene) return;
      state.renderer.resetState();
      state.customCoords.setCenter(state.center);
      var cameraParams = state.customCoords.getCameraParams();
      state.camera.near = cameraParams.near;
      state.camera.far = cameraParams.far;
      state.camera.fov = cameraParams.fov;
      state.camera.position.set.apply(state.camera.position, cameraParams.position);
      state.camera.up.set.apply(state.camera.up, cameraParams.up);
      state.camera.lookAt.apply(state.camera, cameraParams.lookAt);
      state.camera.updateProjectionMatrix();
      state.renderer.render(state.scene, state.camera);
      state.renderer.resetState();

      if (!state.ready) {
        state.ready = true;
        window.__PIPELINE_3D_READY = true;
        updateExportReadyState({pipeline3d: true});
        setStats(formatProjectedStats(state.projected));
        setPipelineReadyStatus(state.projected, state.projectionLabel);
      }
    }
  });
}

function setPipelineReadyStatus(projected, projectionLabel){
  setStatus(
    '真实 3D 图层已加载；' +
    formatProjectedStats(projected) +
    '；坐标系: ' + projectionLabel
  );
}

function buildPipeline3DScene(state){
  var material = new THREE.MeshBasicMaterial({
    color: PIPELINE_3D_STYLE.color,
    depthTest: false,
    depthWrite: false
  });
  var verticalMaterial = new THREE.MeshBasicMaterial({
    color: PIPELINE_3D_STYLE.verticalColor,
    depthTest: false,
    depthWrite: false
  });
  var verticalHaloMaterial = new THREE.MeshBasicMaterial({
    color: PIPELINE_3D_STYLE.verticalHaloColor,
    transparent: true,
    opacity: 0.34,
    depthTest: false,
    depthWrite: false
  });
  var undergroundMaterial = new THREE.MeshBasicMaterial({
    color: PIPELINE_3D_STYLE.undergroundColor,
    transparent: true,
    opacity: PIPELINE_3D_STYLE.undergroundOpacity,
    depthTest: false,
    depthWrite: false
  });
  var verticalJointMaterial = new THREE.MeshBasicMaterial({
    color: PIPELINE_3D_STYLE.verticalColor,
    depthTest: false,
    depthWrite: false
  });
  var segmentGeometry = new THREE.CylinderGeometry(
    1,
    1,
    1,
    PIPELINE_3D_STYLE.radialSegments,
    1,
    false
  );
  var jointGeometry = new THREE.SphereGeometry(PIPELINE_3D_STYLE.jointRadius, PIPELINE_3D_STYLE.radialSegments, 8);

  state.projected.features.forEach(function(feature){
    var coords = state.customCoords.lngLatsToCoords(feature.path.map(pointToLngLat));
    for (var i = 1; i < feature.path.length; i += 1) {
      addStyledPipelineSegment(
        state.scene,
        segmentGeometry,
        jointGeometry,
        material,
        verticalMaterial,
        verticalHaloMaterial,
        undergroundMaterial,
        verticalJointMaterial,
        coords[i - 1],
        coords[i],
        feature.path[i - 1],
        feature.path[i]
      );
    }
  });
}

function addStyledPipelineSegment(scene, segmentGeometry, jointGeometry, material, verticalMaterial, verticalHaloMaterial, undergroundMaterial, verticalJointMaterial, startCoord, endCoord, startPoint, endPoint){
  var start = createThreeVector(startCoord, startPoint.height);
  var end = createThreeVector(endCoord, endPoint.height);
  var vertical = isVerticalProjectedSegment(startPoint, endPoint);
  var startBelow = startPoint.height < 0;
  var endBelow = endPoint.height < 0;

  if (startBelow && endBelow) {
    addUndergroundPipeSegment(scene, segmentGeometry, undergroundMaterial, start, end, vertical);
    return;
  }

  if (!startBelow && !endBelow) {
    addAboveGroundPipeSegment(scene, segmentGeometry, material, verticalMaterial, verticalHaloMaterial, verticalJointMaterial, jointGeometry, start, end, vertical);
    return;
  }

  var ground = interpolateGroundCrossing(start, end);
  if (startBelow) {
    addUndergroundPipeSegment(scene, segmentGeometry, undergroundMaterial, start, ground, vertical);
    addAboveGroundPipeSegment(scene, segmentGeometry, material, verticalMaterial, verticalHaloMaterial, verticalJointMaterial, jointGeometry, ground, end, vertical);
  } else {
    addAboveGroundPipeSegment(scene, segmentGeometry, material, verticalMaterial, verticalHaloMaterial, verticalJointMaterial, jointGeometry, start, ground, vertical);
    addUndergroundPipeSegment(scene, segmentGeometry, undergroundMaterial, ground, end, vertical);
  }
}

function addAboveGroundPipeSegment(scene, segmentGeometry, material, verticalMaterial, verticalHaloMaterial, verticalJointMaterial, jointGeometry, start, end, vertical){
  if (vertical) {
    addPipeSegment(
      scene,
      segmentGeometry,
      verticalHaloMaterial,
      start,
      end,
      PIPELINE_3D_STYLE.verticalHaloRadius,
      9
    );
  }
  addPipeSegment(
    scene,
    segmentGeometry,
    vertical ? verticalMaterial : material,
    start,
    end,
    vertical ? PIPELINE_3D_STYLE.verticalRadius : PIPELINE_3D_STYLE.radius,
    vertical ? 12 : 10
  );
  if (vertical) {
    addPipelineJoint(scene, jointGeometry, verticalJointMaterial, start);
    addPipelineJoint(scene, jointGeometry, verticalJointMaterial, end);
  }
}

function addUndergroundPipeSegment(scene, geometry, material, start, end, vertical){
  var radius = vertical ? PIPELINE_3D_STYLE.verticalRadius * 0.82 : PIPELINE_3D_STYLE.radius * 0.82;
  addPipeSegment(scene, geometry, material, start, end, radius, vertical ? 7 : 6);
}

function interpolateGroundCrossing(start, end){
  var denominator = start.z - end.z;
  var t = Math.abs(denominator) <= 0.000001 ? 0.5 : start.z / denominator;
  t = Math.max(0, Math.min(1, t));
  return start.clone().lerp(end, t);
}

function addPipeSegment(scene, geometry, material, start, end, radius, renderOrder){
  var direction = new THREE.Vector3().subVectors(end, start);
  var length = direction.length();
  if (length <= 0.001) return;
  var mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  mesh.renderOrder = Number.isFinite(renderOrder) ? renderOrder : 10;
  mesh.scale.set(radius, length, radius);
  scene.add(mesh);
}

function addPipelineJoint(scene, geometry, material, position){
  var joint = new THREE.Mesh(geometry, material);
  joint.position.copy(position);
  joint.renderOrder = 11;
  scene.add(joint);
}

function createThreeVector(coord, height){
  return new THREE.Vector3(coord[0], coord[1], Number.isFinite(height) ? height : 0);
}

function getPipelineRenderCenter(projected){
  if (projected.bounds) {
    return [
      (projected.bounds.minLng + projected.bounds.maxLng) / 2,
      (projected.bounds.minLat + projected.bounds.maxLat) / 2
    ];
  }
  for (var i = 0; i < projected.features.length; i += 1) {
    if (projected.features[i].path.length) {
      return pointToLngLat(projected.features[i].path[0]);
    }
  }
  return VIEW_PRESET.center;
}

function pointToLngLat(point){
  if (Array.isArray(point)) return [point[0], point[1]];
  return [point.lng, point.lat];
}

function isVerticalProjectedSegment(a, b){
  return isVerticalSegment(a, b);
}

function createValveSymbol(valve){
  var rotation = Number.isFinite(valve.rotation) ? valve.rotation : 0;
  return new AMap.Marker({
    position: valve.lnglat,
    zIndex: getLayerZIndex('label'),
    offset: new AMap.Pixel(-VALVE_STYLE.width / 2, -VALVE_STYLE.height),
    title: valve.name || '阀门',
    content: createValveSvg(rotation)
  });
}

function createValveSvg(rotation){
  var symbolRotation = Number.isFinite(rotation) ? rotation : 0;
  return [
    '<div style="width:' + VALVE_STYLE.width + 'px;height:' + VALVE_STYLE.height + 'px;transform:translateY(-2px);">',
      '<svg width="' + VALVE_STYLE.width + '" height="' + VALVE_STYLE.height + '" viewBox="0 0 38 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
        '<defs>',
          '<filter id="valveShadow" x="-40%" y="-30%" width="180%" height="180%">',
            '<feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="rgba(35,21,9,0.42)"/>',
          '</filter>',
        '</defs>',
        '<g filter="url(#valveShadow)">',
          '<path d="M19 50 L14.5 38 H23.5 Z" fill="' + VALVE_STYLE.borderColor + '" opacity="0.82"/>',
          '<path d="M19 42 V30" stroke="' + VALVE_STYLE.poleColor + '" stroke-width="3" stroke-linecap="round"/>',
          '<circle cx="19" cy="20" r="16" fill="' + VALVE_STYLE.symbolColor + '" stroke="' + VALVE_STYLE.borderColor + '" stroke-width="2"/>',
          '<circle cx="19" cy="20" r="12" fill="rgba(255,246,226,0.18)" stroke="rgba(255,255,255,0.72)" stroke-width="1"/>',
          '<g transform="rotate(' + symbolRotation + ' 19 20)">',
            '<path d="M9.5 13.5 L18.4 20 L9.5 26.5 Z" fill="#fff7e4" stroke="' + VALVE_STYLE.borderColor + '" stroke-width="1.4" stroke-linejoin="round"/>',
            '<path d="M28.5 13.5 L19.6 20 L28.5 26.5 Z" fill="#fff7e4" stroke="' + VALVE_STYLE.borderColor + '" stroke-width="1.4" stroke-linejoin="round"/>',
            '<circle cx="19" cy="20" r="2.6" fill="' + VALVE_STYLE.accentColor + '" stroke="' + VALVE_STYLE.borderColor + '" stroke-width="1.2"/>',
            '<path d="M19 11.2 V28.8" stroke="' + VALVE_STYLE.borderColor + '" stroke-width="1.4" stroke-linecap="round"/>',
          '</g>',
        '</g>',
      '</svg>',
    '</div>'
  ].join('');
}

function createValveLabel(valve){
  return new AMap.Text({
    text: valve.name,
    position: valve.lnglat,
    zIndex: getLayerZIndex('label') + 1,
    offset: new AMap.Pixel(10, -16),
    style: {
      padding: '1px 4px',
      border: 'none',
      background: 'transparent',
      color: VALVE_STYLE.textColor,
      fontSize: '12px',
      fontWeight: '600',
      textShadow: '0 0 2px ' + VALVE_STYLE.haloColor + ', 0 0 6px ' + VALVE_STYLE.haloColor
    }
  });
}

function clearDxfOverlays(){
  if (dxfThreeLayer) {
    disposePipeline3DState(dxfThreeState);
    try {
      map.remove(dxfThreeLayer);
    } catch (error) {
      console.warn('Failed to remove 3D pipeline layer', error);
    }
    dxfThreeLayer = null;
    dxfThreeState = null;
  }
  if (dxfOverlays.length) {
    map.remove(dxfOverlays);
  }
  dxfOverlays = [];
  dxfValveOverlays = [];
  currentProjected = null;
  window.__PIPELINE_3D_READY = false;
  updateExportReadyState({dxf: false, pipeline3d: false, valves: false});
}

function disposePipeline3DState(state){
  if (!state || !state.scene) return;
  state.scene.traverse(function(object){
    if (object.geometry && typeof object.geometry.dispose === 'function') {
      object.geometry.dispose();
    }
    if (object.material) {
      if (Array.isArray(object.material)) {
        object.material.forEach(function(material){
          if (material && typeof material.dispose === 'function') material.dispose();
        });
      } else if (typeof object.material.dispose === 'function') {
        object.material.dispose();
      }
    }
  });
}

function fitPipelineView(){
  if (!dxfOverlays.length) return;
  if (hasViewParamsInUrl()) return;
  map.setFitView(dxfOverlays, false, VIEW_PRESET.fitPadding);
  window.setTimeout(function(){
    if (typeof map.setZoom === 'function') map.setZoom(VIEW_PRESET.fitZoom);
    if (typeof map.setPitch === 'function') map.setPitch(VIEW_PRESET.pitch);
    if (typeof map.setRotation === 'function') map.setRotation(VIEW_PRESET.rotation);
  }, 220);
}

function hasViewParamsInUrl(){
  var params = new URLSearchParams(window.location.search);
  return params.has('center') || params.has('zoom') || params.has('pitch') || params.has('rotation');
}

function setStats(message){
  var summary = document.getElementById('statusSummary');
  if (summary) summary.textContent = summarizeStats(message);
}

function summarizeStats(message){
  if (!message) return '待加载';
  return String(message).split(' / ').slice(0, 3).join(' / ');
}

function formatProjectedStats(projected){
  return [
    projected.features.length + ' 条管线',
    projected.valves.length + ' 个阀门',
    '显示阀门 ' + projected.visibleValveCount + ' 个',
    '实际高差 ' + projected.zRange.delta.toFixed(2) + 'm',
    '局部地面半径 ' + projected.groundSearchRadius.toFixed(2) + 'm',
    '相对地面 ' + projected.relativeGroundRange.min.toFixed(2) + '~' + projected.relativeGroundRange.max.toFixed(2) + 'm',
    '显示x' + PIPELINE_3D_STYLE.heightScale,
    '地下 ' + projected.undergroundSegments + ' 段',
    '触地 ' + projected.touchingGroundSegments + ' 段',
    '跨地面 ' + projected.crossingGroundSegments + ' 段',
    projected.verticalSegments + ' 处竖向',
    window.__PIPELINE_3D_READY ? '真实3D图层' : '等待真实3D图层'
  ].join(' / ');
}

function makePoint(x, y, z){
  return [x, y, normalizeZ(z)];
}

function normalizeZ(z){
  return Number.isFinite(z) ? z : 0;
}

function isVerticalSegment(a, b){
  if (!a || !b) return false;
  var dx = a.x - b.x;
  var dy = a.y - b.y;
  var planarDistance = Math.sqrt(dx * dx + dy * dy);
  return planarDistance <= PIPELINE_3D_STYLE.verticalPlanarTolerance &&
    Math.abs(a.z - b.z) > PIPELINE_3D_STYLE.verticalHeightTolerance;
}

function firstValue(values){
  return Array.isArray(values) && values.length ? values[0] : '';
}

function firstNumber(values){
  return toNumber(firstValue(values));
}

function toNumber(value){
  if (value == null || value === '') return NaN;
  return Number(value);
}

function isValidPoint(point){
  return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function setStatus(message){
  var summary = document.getElementById('statusSummary');
  if (summary) summary.textContent = summarizeStatus(message);
}

function summarizeStatus(message){
  var text = String(message || '待加载');
  return text.length > 48 ? text.slice(0, 48) + '...' : text;
}

function transformLat(x, y){
  var ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  ret += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
  ret += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
  return ret;
}

function transformLng(x, y){
  var ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  ret += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
  ret += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
  return ret;
}

function outOfChina(lng, lat){
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function wgs84ToGcj02(lng, lat){
  if (outOfChina(lng, lat)) return [lng, lat];
  var a = 6378245.0;
  var ee = 0.00669342162296594323;
  var dLat = transformLat(lng - 105.0, lat - 35.0);
  var dLng = transformLng(lng - 105.0, lat - 35.0);
  var radLat = lat / 180.0 * Math.PI;
  var magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  var sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
  dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
  return [lng + dLng, lat + dLat];
}

async function boot(){
  var amapKey = import.meta.env.VITE_AMAP_KEY || import.meta.env.AMAP_KEY || '';
  if (!amapKey) {
    setStatus('缺少高德地图 Key：请在 .env 中配置 VITE_AMAP_KEY。');
    return;
  }
  try {
    AMap = await AMapLoader.load({
      key: amapKey,
      version: '2.0',
      plugins: ['AMap.ControlBar', 'AMap.ToolBar']
    });
    window.AMap = AMap;
    mapInit();
  } catch (error) {
    console.error(error);
    setStatus('高德地图 SDK 加载失败：请检查 .env 中的 VITE_AMAP_KEY 和网络。');
  }
}

boot();

