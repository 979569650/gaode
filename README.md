# 宽厚里燃气管线地图

这是一个面向宽厚里燃气管线巡检、维护和出图的 3D 地图工具。项目把 DXF 管线数据加载到高德 3D 地图上，展示中压/低压管线、阀门、调压柜、楼块范围，并提供 Web 地图页和手机导航页。

## 在线页面

- 入口页：https://979569650.github.io/kuanhouli-gas-pipeline-map/
- Web 版地图发布页：https://979569650.github.io/kuanhouli-gas-pipeline-map/map3d.html
- 手机版导航页：https://979569650.github.io/kuanhouli-gas-pipeline-map/navigation.html

## 主要功能

- 加载 `宽厚里.dxf` 管线数据。
- 按压力区分管线颜色：中压红色、低压绿色、未分类灰色。
- 识别并显示阀门、主阀门、分支阀门和调压柜。
- Web 版地图支持样式调整、楼块范围、图层控制和出图相关配置。
- 手机版导航页支持设施选择、路线规划、定位跟踪、方向提示和语音播报能力。
- GitHub Pages 自动发布，发布产物包含页面、DXF 数据和静态样式配置。

## 本地运行

先安装依赖：

```powershell
npm install
```

创建 `.env`，参考 `.env.example` 配置高德 Web JS API Key：

```env
VITE_AMAP_KEY=你的高德Key
VITE_AMAP_SECURITY_CODE=你的安全密钥
VITE_DXF_FILE_NAME=宽厚里.dxf
```

启动本地开发：

```powershell
npm run dev
```

启动带本地接口的出图/保存配置服务：

```powershell
npm run serve
```

## 构建与发布

普通构建：

```powershell
npm run build
```

GitHub Pages 构建：

```powershell
npm run build:pages
```

`build:pages` 会在 Vite 构建后自动复制：

- `宽厚里.dxf`
- `config/map3d-style.json`
- `dist/index.html` 入口页

项目已配置 `.github/workflows/pages.yml`。推送到 `main` 后，GitHub Actions 会自动构建并发布到 GitHub Pages。

## 关键文件

- `map3d.html`：Web 版地图发布页。
- `navigation.html`：手机版导航页。
- `src/main.js`：地图、DXF 加载、设施识别、导航和交互主逻辑。
- `src/styles/map3d.css`：地图控制台和手机导航 UI 样式。
- `config/map3d-style.json`：地图样式、图层、管线和设施展示配置。
- `scripts/export-server.js`：本地服务、配置保存和出图接口。
- `scripts/prepare-github-pages.js`：GitHub Pages 发布前的静态资源整理脚本。

## 注意事项

- GitHub Pages 是公开托管，仓库和发布页中的 `宽厚里.dxf` 可被公网访问。
- 高德 Key 和安全密钥通过 GitHub Secrets 注入，不应提交到源码。
- GitHub Pages 上不能写入 `config/map3d-style.json`；线上页面读取的是发布时复制进去的静态配置。本地需要保存样式时请使用 `npm run serve`。
