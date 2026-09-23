/*
 * SPDX-FileCopyrightText: 2026 Jos Verlinde
 * SPDX-License-Identifier: MIT
 */

const DOCUMENT_BASE = globalThis.document?.baseURI
const PACKAGE_BASE = DOCUMENT_BASE
  ? new URL('assets/pyright-worker/', DOCUMENT_BASE).href
  : 'assets/pyright-worker/'

/** Runtime manifest URL derived from the deployed copied worker assets. */
const DEFAULT_RUNTIME_MANIFEST_URL = `${PACKAGE_BASE}assets/runtime-manifest.json`

/** Origin of the deployed assets, permitted for manifest and runtime asset fetches. */
const DEFAULT_RUNTIME_ALLOWED_ORIGINS = DOCUMENT_BASE ? [new URL(PACKAGE_BASE).origin] : null

/** Cache Storage namespace for last-known-good runtime selection. */
const DEFAULT_RUNTIME_CACHE_NAME = 'viperide-pyright-runtime'

/** localStorage key for last-known-good runtime metadata. */
const DEFAULT_RUNTIME_STORAGE_KEY = 'viperide-pyright-runtime-lkg'

const normalizePackageName = value =>
  String(value || '').trim().toLowerCase().replace(/[-_.]+/g, '-')

/** Match a bundled version against an exact pin or a `1.29.0.*` catalog specifier. */
const matchesRequestedVersion = (candidate, requested) => {
  if (candidate === requested) { return true }
  if (!requested.endsWith('.*')) { return false }
  const prefix = requested.slice(0, -2)
  return candidate === prefix || candidate.startsWith(`${prefix}.`)
}

export function bundledStubPackageEntry(manifest, requestedPackage) {
  if (!requestedPackage?.packageName || !requestedPackage.version) { return null }
  const requestedName = normalizePackageName(requestedPackage.packageName)
  return manifest?.boards?.find(board =>
    board.file &&
    normalizePackageName(board.package) === requestedName &&
    matchesRequestedVersion(board.package_version, requestedPackage.version)) || null
}

const DEFAULT_VIPER_TOOLS_STUBS = DOCUMENT_BASE && typeof VIPER_TOOLS_STUBS_FILENAME === 'string' ? {
  url: new URL(
    `assets/viper-tools-stubs/${VIPER_TOOLS_STUBS_FILENAME}`,
    DOCUMENT_BASE,
  ).href,
  size: VIPER_TOOLS_STUBS_SIZE,
  sha256: VIPER_TOOLS_STUBS_SHA256,
} : null

/**
 * Load worker metadata from the npm package assets copied into the ViperIDE build.
 *
 * When a `runtimeManifestUrl` is configured the reusable client selects a
 * compatible immutable runtime at startup.  The copied npm worker URL is
 * always supplied as the bundled fallback so ViperIDE works offline and
 * when no compatible runtime is available.
 */
export class TypecheckingAssets {
  /**
   * @param {object} [dependencies={}] Browser API overrides for tests or custom hosts.
   * @param {typeof fetch} [dependencies.fetch] Fetch implementation.
   * @param {string} [dependencies.packageBase] Public URL of the copied worker package.
   * @param {string} [dependencies.runtimeManifestUrl] Runtime manifest URL for dynamic selection.
   *   Defaults to the deployed `assets/runtime-manifest.json` relative to `packageBase`.
   *   Pass `null` to disable manifest loading (bundled-only mode).
   * @param {string[]} [dependencies.runtimeAllowedOrigins] Permitted origins for manifest/assets.
   *   Defaults to the `packageBase` origin.
   * @param {string} [dependencies.runtimeCacheName] Cache Storage namespace.
   * @param {string} [dependencies.runtimeStorageKey] localStorage last-known-good key.
    * @param {{url: string, size: number, sha256: string}} [dependencies.viperToolsStubs]
    *   Build-generated Viper tools wheel metadata.
   */
  constructor({
    // Browser fetch implementations may require their global object as the receiver.
    fetch: fetchAsset = globalThis.fetch?.bind(globalThis),
    packageBase = PACKAGE_BASE,
    runtimeManifestUrl = DEFAULT_RUNTIME_MANIFEST_URL,
    runtimeAllowedOrigins = DEFAULT_RUNTIME_ALLOWED_ORIGINS,
    runtimeCacheName = DEFAULT_RUNTIME_CACHE_NAME,
    runtimeStorageKey = DEFAULT_RUNTIME_STORAGE_KEY,
    viperToolsStubs = DEFAULT_VIPER_TOOLS_STUBS,
  } = {}) {
    if (typeof fetchAsset !== 'function') {
      throw new TypeError('TypecheckingAssets requires fetch')
    }
    this.fetchAsset = fetchAsset
    if (!packageBase) { throw new TypeError('TypecheckingAssets requires packageBase') }
    this.packageBase = packageBase.endsWith('/') ? packageBase : `${packageBase}/`
    this.manifestPromise = null
    this.runtimeManifestUrl = runtimeManifestUrl || null
    this.runtimeAllowedOrigins = runtimeAllowedOrigins || null
    this.runtimeCacheName = runtimeCacheName
    this.runtimeStorageKey = runtimeStorageKey
    this.viperToolsStubs = viperToolsStubs
  }

  /**
   * Resolve a board ID to the reusable client's runtime configuration.
   *
   * The returned config includes `workerUrl` (the bundled fallback) and,
   * when a runtime manifest URL is configured, the `runtimeManifestUrl`,
   * `runtimeAllowedOrigins`, `runtimeCacheName`, and `runtimeStorageKey`
   * fields that `createLSPClient` uses to select a compatible immutable
   * runtime without an app rebuild.
   *
    * @param {string|{boardId?: string, viperToolsStubs?: boolean,
    *   extraStubArchives?: object[]}} [config={}] Requested board or configuration.
   * @returns {Promise<object>} Worker URL, runtime options, board package/fallback, and manifest entry.
   */
  async prepare(config = {}) {
    const manifest = await this.loadManifest()
    const requestedConfig = typeof config === 'string' ? { boardId: config } : config
    const boardId = requestedConfig.boardId
    const selectedId = boardId || manifest.default
    const board = manifest.boards.find(item => item.id === selectedId) ||
      (requestedConfig.boardStubPackage && manifest.boards.find(item => item.id === manifest.default))
    if (!board) {
      throw new Error(`Unknown type-checking stub bundle: ${selectedId}`)
    }

    const extraStubArchives = await this.extraStubArchives(requestedConfig)
    const requestedStubPackage = requestedConfig.boardStubPackage
    const useBundledStubPackage = bundledStubPackageEntry(manifest, requestedStubPackage)

    return {
      workerUrl: `${this.packageBase}dist/pyright_worker.js`,
      ...this.runtimeOptions(),
      boardStubs: board.file ? undefined : false,
      ...(board.file ? { boardStubsUrl: `${this.packageBase}assets/${board.file}` } : {}),
      boardStubPackage: requestedStubPackage && !useBundledStubPackage
        ? requestedStubPackage
        : undefined,
      extraStubArchives,
      stubBundle: Object.freeze({ ...board, id: selectedId }),
    }
  }

  async extraStubArchives(config) {
    const archives = new Map()
    const providedArchives = (config.extraStubArchives || []).filter(
      archive => config.viperToolsStubs !== false || normalizePackageName(archive.packageName) !== 'viper-tools-stubs',
    )
    const replacesViperTools = providedArchives.some(
      archive => normalizePackageName(archive.packageName) === 'viper-tools-stubs',
    )
    if (config.viperToolsStubs === true && !replacesViperTools) {
      if (!this.viperToolsStubs) { throw new Error('Viper tools stubs are not bundled') }
      archives.set('viper-tools-stubs', {
        packageName: 'viper-tools-stubs',
        archive: {
          ...this.viperToolsStubs,
          allowedOrigins: [new URL(this.viperToolsStubs.url).origin],
        },
      })
    }
    for (const archive of providedArchives) {
      archives.set(normalizePackageName(archive.packageName), archive)
    }
    return [...archives.values()]
  }

  /**
   * Build the runtime manifest options passed through to `createLSPClient`.
   *
   * Returns an empty object when no manifest URL is configured, preserving
   * the bundled-only startup path.
   *
   * @returns {object} Runtime manifest options or `{}`.
   */
  runtimeOptions() {
    if (!this.runtimeManifestUrl) { return {} }
    return {
      runtimeManifestUrl: this.runtimeManifestUrl,
      ...(this.runtimeAllowedOrigins
        ? { runtimeAllowedOrigins: this.runtimeAllowedOrigins }
        : {}),
      runtimeCacheName: this.runtimeCacheName,
      runtimeStorageKey: this.runtimeStorageKey,
    }
  }

  /**
   * Load and memoize the worker stub manifest.
   *
   * Failed loads are not cached and may be retried.
   *
   * @returns {Promise<{default: string, boards: object[]}>} Stub manifest.
   */
  loadManifest() {
    if (!this.manifestPromise) {
      this.manifestPromise = this.fetchAsset(`${this.packageBase}assets/stubs-manifest.json`).
        then(response => this.requireResponse(response, 'stub manifest')).
        then(response => response.json()).
        then(manifest => {
          if (!manifest?.default || !Array.isArray(manifest.boards)) {
            throw new Error('Type-checking stub manifest is invalid')
          }
          return manifest
        }).
        catch(error => {
          // A failed request may be retried when initialization is attempted again.
          this.manifestPromise = null
          throw error
        })
    }
    return this.manifestPromise
  }

  requireResponse(response, description) {
    if (!response.ok) {
      throw new Error(`Failed to load type-checking ${description}: HTTP ${response.status}`)
    }
    return response
  }
}

export const typecheckingAssets = new TypecheckingAssets()
