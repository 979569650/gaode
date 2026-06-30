const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const CONFIG_DIR = path.join(ROOT, 'config');

function copyDxfFiles() {
  const dxfFiles = fs.readdirSync(ROOT).filter((name) => name.toLowerCase().endsWith('.dxf'));
  if (!dxfFiles.length) {
    throw new Error('No .dxf file found in project root.');
  }

  for (const fileName of dxfFiles) {
    fs.copyFileSync(path.join(ROOT, fileName), path.join(DIST_DIR, fileName));
  }

  return dxfFiles;
}

function writeIndexPage() {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>宽厚里地图</title>
  <style>
    body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f6f7f9;color:#172033}
    main{min-height:100vh;display:grid;place-items:center;padding:24px}
    section{width:min(520px,100%);display:grid;gap:12px}
    h1{font-size:24px;margin:0 0 8px}
    a{display:block;padding:14px 16px;border:1px solid #d5dbe5;border-radius:8px;background:#fff;color:#1456cc;text-decoration:none;font-weight:700}
    p{margin:0;color:#667085;line-height:1.6}
  </style>
</head>
<body>
  <main>
    <section>
      <h1>宽厚里地图</h1>
      <a href="./map3d.html">打开 Web 版地图发布页</a>
      <a href="./navigation.html">打开手机版导航页</a>
      <p>手机实地测试请使用手机版导航页，并允许浏览器定位权限。</p>
    </section>
  </main>
</body>
</html>
`;
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html, 'utf8');
}

function copyStyleConfig() {
  const source = path.join(CONFIG_DIR, 'map3d-style.json');
  const targetDir = path.join(DIST_DIR, 'config');
  const target = path.join(targetDir, 'map3d-style.json');
  if (!fs.existsSync(source)) return false;

  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(source, target);
  return true;
}

if (!fs.existsSync(DIST_DIR)) {
  throw new Error('dist directory does not exist. Run npm run build first.');
}

const copied = copyDxfFiles();
const copiedConfig = copyStyleConfig();
writeIndexPage();
console.log(`[pages] copied DXF: ${copied.join(', ')}`);
if (copiedConfig) console.log('[pages] copied config/map3d-style.json');
console.log('[pages] wrote dist/index.html');
