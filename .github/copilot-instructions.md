# Copilot guidance

## Overview
- **What it ships**: This repo builds **MARS Explorer**, a Vite + React 19 TypeScript mash-up that renders Swiss railway position points, edges, and nodes with MapLibre GL, `flatgeobuf`, and `pmtiles` data sources ([README.md](README.md) summarizes the public deployment). It keeps the map state in the URL hash, lets you box-select features, and surfaces feature details + layer/tag controls on top of a static `public/lightbasemap_v1190_reduced.json` style.
- **Project type**: Single-page React client with no runtime backend in this folder (there is an unused `backend-legacy` FastAPI/DuckDB experiment at [backend-legacy/README.md](backend-legacy/README.md) if you ever need server-generated MVT tiles).
- **Stack & runtimes**: Node.js + Yarn (requires Node 24.11.x per [.node_version](.node_version)). UI deps include `react`, `react-dom`, `react-map-gl/maplibre`, `maplibre-gl`, `flatgeobuf`, `pmtiles`, `react-color`, `@mapbox/mapbox-gl-draw`, and `@turf/simplify`; dev toolchain is Vite 7 + TypeScript 5.2 + ESLint 9 via [package.json](package.json) and [eslint.config.js](eslint.config.js).
- **Key entry points**: `src/main.tsx` hydrates `App` and `src/App.tsx` wires the map, data loading, Hash syncing, and control components (`LayerControl`, `TagsFilter`, `SelectedFeaturesPanel`, `BoxSelect`, `CoordinatesDisplay`).

## Environment & prerequisites
- Always run `node -v` before you begin; the repo tracks Node 24.11.1 in [.node_version](.node_version) so you can spot mismatched shells.
- Make sure Yarn 1.22.x (the CI image uses 1.22.22) is available; `yarn install` (or `yarn install --frozen-lockfile` to match CI) is the first step after cloning.
- There are no manual database downloads—data comes from these live endpoints:
  - `https://zzeekk-test.s3.eu-central-1.amazonaws.com/mars-open/geometries/{edges,nodes}.fgb`
  - `https://zzeekk-test.s3.eu-central-1.amazonaws.com/mars-open/geometries/pp.pmtiles/{z}/{x}/{y}.mvt`
  - `mapterhorn://` tiles resolved by a custom PMTiles protocol defined in `src/App.tsx`.

## Build & validation recipe
1. **Bootstrap** – run `yarn install --frozen-lockfile` (CI builds this way, see [lint workflow](.github/workflows/lint.yml)). Local output: `Already up-to-date` after dependencies installed (0.21s).
2. **Development** – start Vite using `yarn dev`. It runs until you stop it, so launch it in a separate terminal and visit `http://localhost:5173`. There is no additional setup.
3. **Production build** – run `yarn build`. Vite 7.2.6 completes in ~3.2s and writes `dist/`. You will see a chunk-size warning because the JS bundle is ~1.3 MB; splitting manually is optional for now.
4. **Preview** – after `yarn build`, run `yarn preview --host 127.0.0.1 --port 4173` to serve `dist/` locally. Stop the server (Ctrl+C) when done.
5. **Lint** – run `yarn lint`. ESLint should pass if React Hooks rules are respected across the codebase.
**Lint workflow ([.github/workflows/lint.yml](.github/workflows/lint.yml))**: runs on every push. The workflow succeeds when React Hooks rules are honored.
6. **Tests** – there are no automated tests in this repo.

If you change dependencies, re-run `yarn install --frozen-lockfile` before building. Recommend always running `yarn install` first, even if `node_modules` already exists.

## Layout & architecture reference
- **Front-end tree**: `[src](src)` houses the map app: `App.tsx` (map lifecycle, protocols, data loading, selection, layer/tag controls), `LayerControl.tsx` (custom `useControl` overlay for toggling layers/terrain), `TagsFilter.tsx` (include/exclude filtering over MapLibre sources), `SelectedFeaturesPanel.tsx` (shows properties, caps at 100 entries, notifies `App` when expanded), `BoxSelect.tsx` (Ctrl-drag rectangle, queries rendered features), and `CoordinatesDisplay.tsx` (live lat/lon/zoom readout). Folder also contains styling (`App.css`, `index.css`) and `assets` for static imagery.
- **Vite + TypeScript config**: `[vite.config.ts](vite.config.ts)` sets `base: "/mars-explorer/"` to align with GitHub Pages, and the compiler settings in `[tsconfig.json](tsconfig.json)` / `[tsconfig.node.json](tsconfig.node.json)` enforce `strict`, `noUnused*`, `module=ESNext`, and `isolatedModules` so every file must be tidy and type-checked before bundling.
- **Lint rules**: `[eslint.config.js](eslint.config.js)` extends the recommended JS/TS rules, includes `react-hooks` + `react-refresh`, and warns on non-component exports; it ignores `dist/`.
- **Public assets**: `[public/lightbasemap_v1190_reduced.json](public/lightbasemap_v1190_reduced.json)` is the map style served by Vite. All other static assets (images, fonts) belong in `public/` or `src/assets` and are copied as-is.
- **Legacy backend**: `[backend-legacy](backend-legacy)` contains a FastAPI + DuckDB MVT server that is marked “NOT IN USE.” The README inside explains `uv venv`, `. .venv/bin/activate`, `uv sync`, and `uvicorn mvt_server:app --reload --port 8000` if you ever need to reproduce that stack. Otherwise, the front end hits the S3+PMTiles sources directly.
- **State flow**: `App` stores selected features, hovered feature, expanded panel entry, and map-ready state. It registers PMTiles protocols for `mapterhorn://` and `pps://`, loads FlatGeobuf edges/nodes, simplifies edges for zoom < 10, and uses `navigation`, `attribution`, `LayerControl`, `TagsFilter`, `SelectedFeaturesPanel`, and `BoxSelect` to orchestrate everything. The hash (`#lng/lat/zoom`) stays in sync via `formatHash` and `parseHashViewState` helpers.

## CI / validation pipelines
- **Lint workflow ([.github/workflows/lint.yml](.github/workflows/lint.yml))**: runs on every push. The workflow succeeds when React Hooks rules are honored.
- **Deployment workflow ([.github/workflows/deploy.yml](.github/workflows/deploy.yml))**: runs on pushes to `main`, checks out the repo, sets up Node 20 (cache `yarn`), installs dependencies with `yarn install --frozen-lockfile`, runs `yarn build`, and deploys the generated `dist/` via GitHub Pages. The `base` path in `vite.config.ts` must match your GitHub Pages repository name.
- **Local validation steps**: `yarn build` → `yarn preview` → `verify interactive map loads`, `yarn lint`. There are no additional automated scripts; the only required validations before pushing are lint + build + preview unless otherwise requested.

## Root files & docs to keep handy
- [README.md](README.md) – product overview, tech stack, deployment notes, and live demo link.
- [package.json](package.json) – scripts (`dev`, `build`, `lint`, `preview`) plus front-end deps and devDeps.
- [yarn.lock](yarn.lock) – lockfile for all dependencies; keep it updated whenever you add/remove packages.
- [eslint.config.js](eslint.config.js) – ESLint configuration with React Hooks + React Refresh plugins.
- [tsconfig.json](tsconfig.json) / [tsconfig.node.json](tsconfig.node.json) – TypeScript + build tooling settings.
- [vite.config.ts](vite.config.ts) – Vite settings, especially `base: "/mars-explorer/"` for GitHub Pages.
- [.node_version](.node_version) – Node 24 is expected by lint CI.
- [public](public) – static assets; `lightbasemap_v1190_reduced.json` is the map style.
- [src](src) – application sources described above.
- [.github](.github) – CI workflows (lint + deploy).
- [backend-legacy](backend-legacy) – retired DuckDB/FastAPI server with its own README and `mvt_server.py`.

## Operational reminders
- Always trust this file as the first stop for onboarding questions. Only run a search (`rg`, `grep`, etc.) if the instruction is missing a detail or appears outdated.
- Keep an eye on React Hooks rules when editing hook-heavy components so lint stays happy.
- Prefer declaring helper logic (e.g., `buildTagConfig`) with function syntax instead of arrow helpers so the style stays consistent across the repo.
- Use the same package/version combinations as CI (Node 24) when replicating workflows to avoid surprises.
- After touching dependencies or workflow scripts, rerun `yarn install --frozen-lockfile` plus `yarn build` and `yarn lint` to keep ecosystem health in sync.