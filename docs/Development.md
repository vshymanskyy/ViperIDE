# ViperIDE Development

This guide covers the common local development workflow for ViperIDE.

## Prerequisites

- Node.js and npm
- Python 3 and pip

Install JavaScript dependencies from the repository root:

```sh
npm install --include=dev
```

## Project Layout

| Path | Purpose |
|---|---|
| `src/` | Browser application source, styles, workers, bundled HTML entry files, translations, and virtual filesystem assets |
| `assets/` | Icons and images copied into the production build |
| `docs/` | User and contributor documentation |
| `packages/viper-tools/` | MicroPython helper package metadata and files |
| `mcp/` | MCP server for controlling ViperIDE from an AI client |
| `src/typechecking/` | Application-owned adapter around the reusable type-checking packages (see [Type-Checking](Type-Checking.md)) |
| `build.py` | Production build script used by GitHub Pages deployment |
| `rollup.config.mjs` | Rollup bundle configuration |

## Base URL

ViperIDE loads its WebAssembly runtimes, virtual filesystem archives and `manifest.json` over absolute URLs, so the origin it is served from has to be baked into the bundle. It is substituted at build time from the `VIPER_IDE_BASE_URL` environment variable:

- In JavaScript, as the `VIPER_IDE_BASE_URL` constant (replaced by Rollup)
- In HTML, as the `${VIPER_IDE_BASE_URL}` placeholder (replaced while copying the files into `build/`)

`build.py` defaults it to `http://localhost:10001` and passes it on to Rollup. CI workflows set `VIPER_IDE_BASE_URL=https://viper-ide.org` explicitly for production builds.

**To override it manually, set `VIPER_IDE_BASE_URL`:**

```sh
export VIPER_IDE_BASE_URL=http://localhost:10001
```

```powershell
$env:VIPER_IDE_BASE_URL = "http://localhost:10001"
```

Without an override, a locally served IDE fetches its assets from the local development server.

## Run Locally

The development server is provided by Rollup watch mode. It serves the `build/` directory and rebuilds when source files change.

Run the full build from the repository root:

```sh
python3 build.py
```

The script:

- Clears and recreates `build/`
- Copies static HTML and assets
- Generates `build/translations.json` from `src/lang/*.json`
- Generates `build/manifest.json` with the version from `package.json`
- Resolves the base URL from `VIPER_IDE_BASE_URL`, defaulting to `http://localhost:10001`
- Vendors `python-minifier` from PyPI into `src/tools_vfs/lib/python_minifier`
- Builds reproducible virtual filesystem archives into `build/assets/`
- Runs ESLint
- Runs the Rollup build
- Inlines generated CSS and JavaScript into the HTML files
- Copies WebAssembly runtime assets into `build/assets/`

The generated site is in `build/`.

Start the watcher:

```sh
npm start
```

### Build with local CodeMirror packages

To test changes from a local `stubs_playground` checkout without changing
ViperIDE's registry dependencies or lockfile, pass its path to `build:local`:

```sh
npm run build:local -- ../stubs_playground
```

Build and start the local development server in one command:

```sh
npm run start:local -- ../stubs_playground
```

Open <http://localhost:10001/?vm=1>. Rollup watches ViperIDE source files; stop
the server with Ctrl+C. Restart the command after changing package sources so
the local Pyright worker is rebuilt.

Build with the local packages and run the full Playwright browser suite:

```sh
npm run test:local -- ../stubs_playground
```

The path may be absolute or relative to the directory where npm is invoked. It
may identify the workspace root, its `packages` directory, either package
directory, or either package's `package.json`. The command builds the local
Pyright worker in development mode, bundles the local LSP client source, and
copies the local worker assets into ViperIDE's `build/` directory.
`test:local` runs the Chromium Playwright suite against that generated build.

Normal `npm run build` builds against the registry versions installed in
`node_modules`.

### Client-owned type-stub overlays

ViperIDE owns the release lifecycle of stubs for modules bundled with
ViperIDE, including `viper-tools-stubs`.

| ViperIDE release process | Reusable type-checking backend |
|---|---|
| Selects and obtains the type-only wheel. | Defines the generic `extraStubArchives` contract. |
| Vendors or publishes the archive. | Forwards host-provided archive metadata. |
| Computes and supplies its byte size, SHA-256, URL/data, and allowed origins. | Validates integrity and rejects unsafe or non-type-only content. |
| Owns the user setting, default, restart behavior, errors, and update cadence. | Mounts accepted stubs under `/extra/<package>` and configures Pyright. |

The backend does not build, publish, select, or bundle ViperIDE wheels. Its npm
artifacts and runtime manifest remain client-neutral. Adding or updating a
ViperIDE overlay changes ViperIDE's assets and configuration only; it does not
require rebuilding or releasing the worker.

The standalone `viper-tools-stubs` project produces a normal wheel with
`uv build`. ViperIDE's release process is responsible for turning the selected
wheel into a deployed, integrity-described asset and passing it through
`extraStubArchives`.

## Browser tests

The Playwright tests in `test/browser/` need a current `build/` directory.
Install Chromium once, then run the suite against the current build:

```sh
npx playwright install chromium
npm run test:browser
```

Use `npm run test:browser:ui` for Playwright's interactive runner. The suite is
configured for Chromium and starts a local static server for `build/` on port
10001. If the build is missing or stale, run `npm run build` first.


## Linting

Run ESLint directly:

```sh
npx eslint
```

The ESLint configuration ignores generated build and Playwright output, `src/websocket_relay.cjs`, and `mcp/`.

## Translations

Translations live in `src/lang/*.json`. During `python3 build.py`, they are combined into `build/translations.json`.

When adding or changing UI strings:

- Update `src/lang/en.json` first
- Keep keys consistent across language files
- Run `python3 build.py` or `npx eslint` before submitting changes

The helper script `src/lang/_update.py` can be used when updating generated translation files.

## MCP Server

The MCP server is maintained separately under `mcp/`.

Install its dependencies:

```sh
cd mcp
npm install
```

For development, build ViperIDE first, then run the MCP server:

```sh
cd ..
python3 build.py
cd mcp
npm start
```

The server serves the built ViperIDE, opens a browser window, and exposes MCP tools for IDE, terminal, file, package, and device operations.

## Release Notes

GitHub Pages deployment builds the static site with:

```sh
python3 build.py
```

MCP distributions are built by the `mcp-dist.yml` workflow from tags matching:

```text
mcp-v*
```

Before release-oriented changes, verify both the root application build and any affected MCP package behavior.
