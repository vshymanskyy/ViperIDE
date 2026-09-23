import { readFile } from "node:fs/promises";
import path from "node:path";

import { BUNDLED_STUB_RUNTIME_VERSION, runtimeVersionFromPackageVersion } from "./helpers.mjs";

const buildMarker = "typecheck-tab";

/**
 * The seeded stub version must resolve to the bundled archive. When it does not, the app
 * requests a published package instead and every seeded test silently downloads a wheel.
 */
export async function validateSeededStubVersion({
  manifestPath = path.resolve("build/assets/pyright-worker/assets/stubs-manifest.json"),
  boardId = "esp32",
  seededVersion = BUNDLED_STUB_RUNTIME_VERSION,
} = {}) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error("Bundled stub manifest is missing; run npm run build first", { cause: error });
  }

  const board = manifest.boards?.find((entry) => entry.id === boardId);
  if (!board) {
    throw new Error(`Bundled stub manifest has no "${boardId}" board`);
  }

  const bundledVersion = runtimeVersionFromPackageVersion(board.package_version);
  if (bundledVersion !== seededVersion) {
    throw new Error(
      `Seeded stub version "${seededVersion}" does not match bundled ` +
      `"${board.package_version}" for ${boardId}; ` +
      "update BUNDLED_STUB_RUNTIME_VERSION in test/browser/helpers.mjs",
    );
  }
}

export async function validateBrowserBuild({
  buildPath = path.resolve("build/index.html"),
  baseURL = "http://localhost:10001",
  fetchImpl = fetch,
} = {}) {
  let html;
  try {
    html = await readFile(buildPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("ViperIDE build is missing; run npm run build first", { cause: error });
    }
    throw error;
  }

  if (!html.includes(buildMarker)) {
    throw new Error("ViperIDE build is stale; run npm run build first");
  }

  const response = await fetchImpl(baseURL);
  const servedHtml = response.ok ? await response.text() : "";
  if (!servedHtml.includes(buildMarker)) {
    throw new Error("ViperIDE served build is stale; run npm run build first");
  }
}

export default async function globalSetup(config) {
  await validateBrowserBuild({ baseURL: config.projects[0].use.baseURL });
  await validateSeededStubVersion();
}