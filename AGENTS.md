# Repository Guidelines

## Project Structure & Module Organization
This is a Vite-based 3D map poster/export tool. The app entry is `map3d.html`; browser logic is in `src/main.js`, with CSS in `src/styles/map3d.css`. Runtime map and export settings live in `config/map3d-style.json`. Node helpers are in `scripts/`: `export-server.js` serves the editable map and local APIs, `export-poster.js` captures PNGs with Playwright, and `package-portable.ps1` builds a Windows portable package. Treat `dist/`, `exports/`, `release/`, and `test-results/` as generated output.

## Build, Test, and Development Commands
- `npm install`: install Vite, AMap loader, Three.js, and Playwright.
- `npm run dev`: start Vite on `127.0.0.1` for quick frontend work.
- `npm run serve`: start the export server, usually at `http://127.0.0.1:8765/map3d.html`, with config save/export APIs.
- `npm run build`: produce the production build in `dist/`.
- `npm run export:poster -- --width=5000 --aspect-ratio=16:9`: export a poster PNG through Playwright.
- `.\scripts\package-portable.ps1`: build and package a portable Windows release; run `npx playwright install chromium` first if Chromium is missing.

## Coding Style & Naming Conventions
Use two-space indentation in JSON and the existing JavaScript style in edited files. Browser code uses `var` and function declarations heavily; follow nearby patterns unless refactoring intentionally. Keep fixed configuration constants uppercase, such as `EXPORT_MAX_PIXELS`. Prefer explicit validation for config, export options, and path handling.

## Testing Guidelines
There is no dedicated automated test suite yet. For changes, run `npm run build` at minimum. For map, DXF, style, or export behavior, also run `npm run serve`, open `/map3d.html`, verify loading with a valid `.env` `VITE_AMAP_KEY`, save style changes, and test one poster export. Name future tests `*.test.js` or `*.spec.js`.

## Commit & Pull Request Guidelines
Recent commits are short and imperative, including `发布` and `config`. Use concise messages that state the change, and avoid opaque placeholders like `123`. Pull requests should include purpose, key files changed, verification commands, and screenshots or exported PNG samples for visual changes. Mention any `.env`, port, DXF data, or Playwright browser requirements.

## Security & Configuration Tips
Keep secrets in `.env`; use `.env.example` for documented keys only. Do not commit real AMap keys or generated export images containing sensitive project data. Validate any new file-serving paths against the repository root, matching the existing server-side path checks.
