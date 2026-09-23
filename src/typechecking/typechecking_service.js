/*
 * SPDX-FileCopyrightText: 2026 Jos Verlinde
 * SPDX-License-Identifier: MIT
 */

// This delay starts after Pyright worker analysis; 300 ms keeps its results close to
// Ruff, whose CodeMirror debounce starts immediately when the document changes.
const DIAGNOSTIC_DELAY_MS = 300
const MICROPYTHON_STUB_TARGETS = new Set(['esp32', 'rp2', 'stm32', 'samd', 'webassembly'])
// One retry per lifecycle field (initializing, switching, restarting) that could plausibly
// replace the transport between the initial attempt and this bound being reached.
const STUB_PACKAGE_QUERY_MAX_ATTEMPTS = 4

/**
 * @typedef {Object} TypecheckingServiceDependencies
 * @property {(config: object) => Promise<{client: object, transport: object,
 *   workspaceDiagnosticsSubscription?: {destroy: () => void}|null}>} createLSPClient
 *   Factory used to start a worker-backed LSP client.
 * @property {(client: object, editorView: object, options: object) => unknown[]} [createLSPPlugin]
 *   Creates CodeMirror extensions for one document. Required together with `configureEditor`
 *   by any host that calls `bindEditor`; a host that never binds editors may omit both.
 * @property {(editorView: object, extensions: unknown[]) => boolean} [configureEditor]
 *   Installs extensions in a host-owned CodeMirror compartment and returns whether it succeeded.
 * @property {(client: object, uri: string, content: string, version: number) => void}
 *   [notifyDocumentChange] Independently optional; always invoked with `?.`.
 * @property {(client: object, uri: string) => void} [notifyDocumentClose]
 *   Independently optional; always invoked with `?.`.
 * @property {(current: {client: object, transport: object,
 *   workspaceDiagnosticsSubscription?: {destroy: () => void}|null}, config: object) =>
 *   Promise<{client: object, transport: object,
 *   workspaceDiagnosticsSubscription?: {destroy: () => void}|null}>} [switchBoard]
 * @property {(config: object) => Promise<object>} [prepareRuntime]
 *   Resolves host configuration to a worker URL and selected stub bundle.
 */

/**
 * @typedef {Object} TypecheckingSnapshot
 * @property {'idle'|'starting'|'ready'|'switching'|'disabled'|'error'|'disposed'} status
 * @property {Error|null} error - Current lifecycle error.
 * @property {object|null} client - Active SimpleLSPClient.
 * @property {object|null} transport - Active WorkerTransport.
 * @property {object|null} selectedStubBundle - Selected manifest board entry.
 * @property {string} typeCheckingMode - Effective Pyright checking mode.
 * @property {string} diagnosticMode - Effective Pyright diagnostic scope.
 * @property {'remote'|'last-known-good'|'bundled'|null} runtimeSource - How the worker was loaded.
 * @property {string|null} runtimeId - Immutable runtime ID or `'bundled'`.
 * @property {object|null} runtimeManifest - Selected validated runtime manifest.
 * @property {object[]} runtimeFallbacks - Rejected runtime candidates before the selection.
 * @property {Map<string, number>} documentVersions - Copy of open LSP document versions.
 * @property {Map<string, object[]>} diagnosticStatus - Copy of diagnostics grouped by URI.
 * @property {Map<string, string>} workspaceFiles - Copy of mirrored workspace files.
 */

/**
 * Resolve the worker stub target from MicroPython or CircuitPython device metadata.
 *
 * `sys.platform` is authoritative for MicroPython. CircuitPython is detected from
 * descriptive identity fields because it can share MCU platform names.
 *
 * @param {object} [devInfo={}] Device information.
 * @returns {string|undefined} Stub bundle ID, or `undefined` when unsupported.
 */
export function stubTargetForDevice(devInfo = {}) {
  const platform = String(devInfo.platform || '').trim().toLowerCase()
  const identity = [
    devInfo.machine,
    devInfo.sysname,
    devInfo.release,
    devInfo.version,
    devInfo.mpy_arch,
  ].filter(Boolean).join(' ').toLowerCase()

  // CircuitPython uses different stub packages even when sys.platform names the same MCU port.
  if (identity.includes('circuitpython')) { return 'circuitpython' }
  if (MICROPYTHON_STUB_TARGETS.has(platform)) { return platform }
  return undefined
}

/**
 * Application-level adapter around the reusable LSP client.
 *
 * One instance owns one worker runtime, all CodeMirror bindings, the mirrored
 * Python workspace, board switching, package-cache restarts, and status snapshots.
 * The class contains no ViperIDE DOM dependencies; hosts inject editor and runtime hooks.
 */
export class TypecheckingService {
  /**
   * @param {TypecheckingServiceDependencies} dependencies Integration dependencies.
   * @throws {TypeError} If `createLSPClient` is missing.
   */
  constructor({
    createLSPClient,
    createLSPPlugin = null,
    configureEditor = null,
    notifyDocumentChange = null,
    notifyDocumentClose = null,
    switchBoard = null,
    prepareRuntime = null,
  }) {
    if (typeof createLSPClient !== 'function') {
      throw new TypeError('TypecheckingService requires createLSPClient')
    }
    this.createLSPClient = createLSPClient
    this.createLSPPlugin = createLSPPlugin
    this.configureEditor = configureEditor
    this.notifyDocumentChange = notifyDocumentChange
    this.notifyDocumentClose = notifyDocumentClose
    this.switchBoard = switchBoard
    this.prepareRuntime = prepareRuntime
    this.client = null
    this.transport = null
    this.workspaceDiagnosticsSubscription = null
    this.selectedStubBundle = null
    this.runtimeSource = null
    this.runtimeId = null
    this.runtimeManifest = null
    this.runtimeFallbacks = []
    this.documentVersions = new Map()
    this.diagnosticStatus = new Map()
    this.editorBindings = new Map()
    this.workspaceFiles = new Map()
    this.status = 'idle'
    this.error = null
    this.initializing = null
    this.generation = 0
    this.requestedConfig = null
    this.runtimeConfig = null
    this.clientConfig = null
    this.switching = null
    this.restarting = null
    this.statusListeners = new Set()
  }

  /**
   * @returns {boolean} Whether the service was permanently disposed.
   */
  isDisposed() {
    return this.status === 'disposed'
  }

  /**
   * Start the worker and LSP handshake.
   *
   * Calls are coalesced while startup is in progress and return the current
   * snapshot immediately when already ready.
   *
   * @param {object} config LSP configuration or input for `prepareRuntime`.
   * @returns {Promise<TypecheckingSnapshot>} Ready service snapshot.
   * @throws {Error} If runtime preparation, worker startup, or editor rebinding fails.
   */
  initialize(config) {
    if (this.isDisposed()) {
      return Promise.reject(new Error('TypecheckingService is disposed'))
    }
    if (this.status === 'ready') {
      return Promise.resolve(this.snapshot())
    }
    if (this.initializing) {
      return this.initializing
    }
    // A generation change prevents a late worker handshake from surviving disposal.
    const generation = this.generation
    this.setStatus('starting', null)

    this.requestedConfig = { ...(config || {}) }
    const prepare = this.prepareRuntime
      ? this.prepareRuntime(this.requestedConfig)
      : Promise.resolve(this.requestedConfig)
    this.initializing = prepare.then(runtimeConfig => {
      if (!runtimeConfig.workerUrl) {
        throw new TypeError('TypecheckingService requires config.workerUrl')
      }
      this.selectedStubBundle = runtimeConfig.stubBundle || null
      this.runtimeConfig = runtimeConfig
      this.clientConfig = {
        ...this.requestedConfig,
        ...runtimeConfig,
        onWorkspaceDiagnosticsChange: diagnostics => this.setWorkspaceDiagnosticStatus(diagnostics),
      }
      if (generation !== this.generation || this.isDisposed()) {
        throw new Error('TypecheckingService was disposed during initialization')
      }
      return this.createLSPClient(this.clientConfig)
    }).then(result => {
      if (generation !== this.generation || this.isDisposed()) {
        this.closeResult(result)
        throw new Error('TypecheckingService was disposed during initialization')
      }
      this.client = result.client
      this.transport = result.transport
      this.workspaceDiagnosticsSubscription = result.workspaceDiagnosticsSubscription || null
      this.runtimeSource = result.runtimeSource || 'bundled'
      this.runtimeId = result.runtimeId || 'bundled'
      this.runtimeManifest = result.runtimeManifest || null
      this.runtimeFallbacks = result.runtimeFallbacks || []
      this.rebindEditors()
      this.setStatus('ready', null)
      return this.snapshot()
    }).catch(error => {
      if (!this.isDisposed()) {
        this.closeRuntime()
        this.setStatus('error', error)
      }
      throw error
    }).finally(() => {
      this.initializing = null
    })

    return this.initializing
  }

  openDocument(uri) {
    if (!uri) { throw new TypeError('Document URI is required') }
    this.documentVersions.set(uri, 1)
    return 1
  }

  /**
   * Set the host callback that installs LSP extensions into an editor.
   *
   * @param {(editorView: object, extensions: unknown[]) => boolean} configureEditor
   * @returns {void}
   */
  setEditorIntegration(configureEditor) {
    if (typeof configureEditor !== 'function') {
      throw new TypeError('TypecheckingService requires an editor configurator')
    }
    this.configureEditor = configureEditor
  }

  /**
   * Verify the editor-integration dependencies a binding cannot function without.
   *
   * `createLSPPlugin` builds the extensions and `configureEditor` installs them; both are
   * called unguarded everywhere a binding is touched, so a binding must never exist without
   * them. `notifyDocumentChange` and `notifyDocumentClose` remain independently optional —
   * a host may care about extensions but never need LSP document-lifecycle notifications —
   * so every call site invokes them with `?.` instead of requiring them here.
   *
   * @throws {Error} If `createLSPPlugin` or `configureEditor` is missing.
   */
  requireEditorIntegration() {
    if (!this.createLSPPlugin || !this.configureEditor) {
      throw new Error('TypecheckingService editor integration is not configured')
    }
  }

  createEditorExtensions(editorView, uri, content) {
    return this.createLSPPlugin(this.client, editorView, {
      fileUri: uri,
      languageId: 'python',
      initialContent: content,
      diagnosticDelayMs: DIAGNOSTIC_DELAY_MS,
      completionDelayMs: 0,
    })
  }

  /**
   * Bind a CodeMirror editor to a workspace path.
   *
   * Binding may occur before initialization; the editor is opened when the
   * runtime becomes ready.
   *
   * @param {object} editorView CodeMirror EditorView-compatible object.
   * @param {string} path Workspace-relative Python path.
   * @returns {Promise<string>} Encoded `file:///workspace/...` document URI.
   */
  async bindEditor(editorView, path) {
    if (this.hasPendingLifecycle()) { await this.settleLifecycle() }
    // A late editorLoaded event must not repopulate bindings after disposal.
    if (this.isDisposed()) { return this.uriForPath(path) }
    this.requireEditorIntegration()

    const uri = this.uriForPath(path)
    const content = editorView.state.doc.toString()
    const workspacePath = this.workspacePath(path)
    this.setWorkspaceFile(workspacePath, content)
    this.editorBindings.set(editorView, { path, uri })
    if (this.status !== 'ready') {
      return uri
    }

    this.openDocument(uri)
    const extensions = this.createEditorExtensions(editorView, uri, content)
    if (!this.configureEditor(editorView, extensions)) {
      this.closeDocument(uri)
      this.editorBindings.delete(editorView)
      throw new Error(`Editor does not support type checking: ${path}`)
    }
    this.emitStatus()
    return uri
  }

  /**
   * Publish the complete current editor document to Pyright.
   *
   * @param {object} editorView Previously bound editor.
   * @param {string} content Complete document text.
   * @returns {boolean} Whether a ready binding was updated.
   */
  changeEditor(editorView, content) {
    const binding = this.editorBindings.get(editorView)
    if (!binding) { return false }
    // Mirror first so edits made while the runtime is replaced are not lost.
    this.setWorkspaceFile(this.workspacePath(binding.path), content, false)
    if (this.status !== 'ready') { return false }
    const version = this.changeDocument(binding.uri)
    this.notifyDocumentChange?.(this.client, binding.uri, content, version)
    return true
  }

  /**
   * Close a bound LSP document and remove its editor extensions.
   *
   * @param {object} editorView Previously bound editor.
   * @returns {boolean} Whether a binding was removed.
   */
  unbindEditor(editorView) {
    const binding = this.editorBindings.get(editorView)
    if (!binding) { return false }
    if (this.status === 'ready') {
      this.notifyDocumentClose?.(this.client, binding.uri)
      this.configureEditor(editorView, [])
    }
    this.closeDocument(binding.uri)
    this.editorBindings.delete(editorView)
    this.emitStatus()
    return true
  }

  /**
   * Rename one file or directory throughout the mirrored workspace and open editors.
   *
   * @param {string} oldPath Existing workspace-relative path.
   * @param {string} newPath Replacement workspace-relative path.
   * @returns {void}
   * @throws {Error} If a renamed editor's extensions cannot be reinstalled.
   */
  renamePath(oldPath, newPath) {
    const canSync = this.status === 'ready'
    const oldTarget = this.workspacePath(oldPath)
    const newTarget = this.workspacePath(newPath)
    for (const [workspacePath, content] of [...this.workspaceFiles]) {
      if (workspacePath !== oldTarget && !workspacePath.startsWith(`${oldTarget}/`)) {
        continue
      }
      const renamedPath = newTarget + workspacePath.slice(oldTarget.length)
      const destinationExisted = this.workspaceFiles.has(renamedPath)
      this.workspaceFiles.delete(workspacePath)
      this.workspaceFiles.set(renamedPath, content)
      if (canSync) {
        this.transport.deleteWorkspaceFile(workspacePath)
        this.transport.syncWorkspaceFile(renamedPath, content)
        this.notifyWorkspaceChange(workspacePath, 3)
        this.notifyWorkspaceChange(renamedPath, destinationExisted ? 2 : 1)
      }
    }

    const failedBindings = []
    for (const [editorView, binding] of this.editorBindings) {
      const renamed = binding.path === oldPath
        ? newPath
        : binding.path.startsWith(`${oldPath}/`)
          ? newPath + binding.path.slice(oldPath.length)
          : null
      if (!renamed) { continue }

      const content = editorView.state.doc.toString()
      if (canSync) {
        this.notifyDocumentClose?.(this.client, binding.uri)
        this.closeDocument(binding.uri)
      }

      const uri = this.uriForPath(renamed)
      this.editorBindings.set(editorView, { path: renamed, uri })
      if (canSync) {
        this.openDocument(uri)
        const extensions = this.createEditorExtensions(editorView, uri, content)
        if (!this.configureEditor(editorView, extensions)) {
          this.closeDocument(uri)
          this.editorBindings.delete(editorView)
          failedBindings.push(renamed)
        }
      }
    }
    this.emitStatus()
    if (failedBindings.length) {
      throw new Error(`Editors do not support type checking: ${failedBindings.join(', ')}`)
    }
  }

  /**
   * Remove a file or directory from the mirrored workspace.
   *
   * @param {string} path Workspace-relative path.
   * @param {boolean} [recursive=false] Remove descendants for a directory path.
   * @returns {void}
   */
  removePath(path, recursive = false) {
    for (const [editorView, binding] of [...this.editorBindings]) {
      if (binding.path === path || (recursive && binding.path.startsWith(`${path}/`))) {
        this.unbindEditor(editorView)
      }
    }

    const target = this.workspacePath(path)
    let deleted = false
    for (const workspacePath of [...this.workspaceFiles.keys()]) {
      if (workspacePath === target || (recursive && workspacePath.startsWith(`${target}/`))) {
        if (this.status === 'ready') {
          this.transport.deleteWorkspaceFile(workspacePath)
          this.notifyWorkspaceChange(workspacePath, 3)
        }
        this.workspaceFiles.delete(workspacePath)
        deleted = true
      }
    }
    if (this.status === 'ready' && !recursive && !deleted) {
      // A removed file may not have been opened during this session.
      this.transport.deleteWorkspaceFile(target)
      this.notifyWorkspaceChange(target, 3)
    }
    this.emitStatus()
  }

  /**
   * Merge Python files into the mirrored workspace.
   *
   * @param {Record<string, string>} files Workspace-relative file contents.
   * @returns {number} Number of files whose content changed.
   */
  hydrateWorkspace(files) {
    let hydrated = 0
    for (const [path, content] of Object.entries(files || {})) {
      if (!path.endsWith('.py') || typeof content !== 'string') { continue }
      const workspacePath = this.workspacePath(path)
      if (this.setWorkspaceFile(workspacePath, content)) { hydrated++ }
    }
    if (hydrated) { this.emitStatus() }
    return hydrated
  }

  /**
   * Reconcile the mirrored workspace to a complete Python-file snapshot.
   *
   * Open editor buffers override supplied content. Preserved paths survive an
   * incomplete device read.
   *
   * @param {Record<string, string>} files Complete workspace snapshot.
   * @param {{preservePaths?: string[]}} [options={}] Reconciliation options.
   * @returns {{synced: number, deleted: number, total: number}} Reconciliation counts.
   */
  replaceWorkspace(files, { preservePaths = [] } = {}) {
    const nextFiles = new Map()
    const preservedWorkspacePaths = new Set(
      preservePaths.map(path => this.workspacePath(path)),
    )
    for (const [path, content] of Object.entries(files || {})) {
      if (!path.endsWith('.py') || typeof content !== 'string') { continue }
      nextFiles.set(this.workspacePath(path), content)
    }

    // Open buffers, including unsaved edits, take precedence over device contents.
    for (const [editorView, binding] of this.editorBindings) {
      nextFiles.set(this.workspacePath(binding.path), editorView.state.doc.toString())
    }

    let deleted = 0
    for (const workspacePath of [...this.workspaceFiles.keys()]) {
      if (nextFiles.has(workspacePath) || preservedWorkspacePaths.has(workspacePath)) { continue }
      this.workspaceFiles.delete(workspacePath)
      if (this.status === 'ready') {
        this.transport.deleteWorkspaceFile(workspacePath)
        this.notifyWorkspaceChange(workspacePath, 3)
      }
      deleted++
    }

    let synced = 0
    for (const [workspacePath, content] of nextFiles) {
      if (this.setWorkspaceFile(workspacePath, content)) { synced++ }
    }
    if (synced || deleted) { this.emitStatus() }
    return { synced, deleted, total: this.workspaceFiles.size }
  }

  setWorkspaceFile(workspacePath, content, notifyFileChange = true) {
    if (this.isDisposed()) { return false }
    const existed = this.workspaceFiles.has(workspacePath)
    if (existed && this.workspaceFiles.get(workspacePath) === content) { return false }
    this.workspaceFiles.set(workspacePath, content)
    if (this.status === 'ready') {
      this.transport.syncWorkspaceFile(workspacePath, content)
      if (notifyFileChange) {
        this.notifyWorkspaceChange(workspacePath, existed ? 2 : 1)
      }
    }
    return true
  }

  syncWorkspaceSnapshot() {
    if (!this.transport) { return }
    for (const [workspacePath, content] of this.workspaceFiles) {
      this.transport.syncWorkspaceFile(workspacePath, content)
      this.notifyWorkspaceChange(workspacePath, 1)
    }
  }

  notifyWorkspaceChange(workspacePath, type) {
    this.client?.notify('workspace/didChangeWatchedFiles', {
      changes: [{ uri: this.uriForPath(workspacePath), type }],
    })
  }

  /**
   * @param {{includeSwitching?: boolean}} [options={}] Matches `settleLifecycle`.
   * @returns {boolean} Whether a caller must wait before proceeding.
   */
  hasPendingLifecycle({ includeSwitching = true } = {}) {
    return Boolean(this.initializing || (includeSwitching && this.switching) || this.restarting)
  }

  /**
   * Wait for any in-flight startup, restart, or (by default) board switch to settle.
   *
   * Lifecycle transitions do not overlap themselves, but a listener reacting to one
   * transition's completion can start another, so each pass re-checks all awaited
   * fields until none remain pending. A rejected transition propagates to every
   * caller currently settling on it, matching what awaiting it directly would do.
   *
   * Callers guard the call with `hasPendingLifecycle()` so that the common case, where
   * nothing is pending, does not pay for an `await`'s microtask deferral before acting.
   *
   * @param {{includeSwitching?: boolean}} [options={}] Set `includeSwitching: false` for
   *   a caller that needs to inspect or coalesce with an in-flight board switch itself.
   * @returns {Promise<void>}
   */
  async settleLifecycle({ includeSwitching = true } = {}) {
    while (this.hasPendingLifecycle({ includeSwitching })) {
      await (this.initializing || (includeSwitching && this.switching) || this.restarting)
    }
  }

  /**
   * Select stubs inferred from connected-device metadata.
   *
   * @param {object} devInfo Device information.
   * @returns {Promise<boolean>} Whether the active stub bundle changed.
   */
  async selectDevice(devInfo) {
    const boardId = stubTargetForDevice(devInfo)
    return boardId ? this.selectStubBundle(boardId) : false
  }

  /**
   * Restart Pyright with a manifest stub bundle.
   *
   * Existing editor buffers and mirrored files are rebound to the replacement runtime.
   *
   * @param {string} boardId Manifest board ID.
   * @returns {Promise<boolean>} `false` when already selected, otherwise `true`.
   */
  async selectStubBundle(boardId) {
    if (this.isDisposed()) { return false }
    // An in-flight switch is coalesced explicitly below, so it is not awaited here.
    if (this.hasPendingLifecycle({ includeSwitching: false })) {
      await this.settleLifecycle({ includeSwitching: false })
    }
    if (typeof boardId !== 'string' || !boardId.trim()) {
      throw new TypeError('Type-checking stub bundle ID is required')
    }
    if (this.isDisposed()) { return false }
    if (this.selectedStubBundle?.id === boardId) { return false }
    if (this.switching) { return this.switching }
    if (this.status !== 'ready' || !this.switchBoard || !this.prepareRuntime) {
      throw new Error('TypecheckingService cannot switch stub bundles')
    }

    // A generation change prevents a late board switch from surviving disposal.
    const generation = this.generation
    // switchBoard tears down the current runtime itself, so it must not be closed twice.
    let runtimeHandedOver = false
    // Block transport users while switchBoard replaces the connected worker.
    this.setStatus('switching', null)
    const requestedConfig = { ...this.requestedConfig, boardId }
    this.switching = this.prepareRuntime(requestedConfig).
      then(async runtimeConfig => {
        if (generation !== this.generation || this.isDisposed()) {
          throw new Error('TypecheckingService was disposed during board switch')
        }
        runtimeHandedOver = true
        return {
          result: await this.switchBoard(
            {
              client: this.client,
              transport: this.transport,
              workspaceDiagnosticsSubscription: this.workspaceDiagnosticsSubscription,
            },
            { ...this.clientConfig, ...runtimeConfig },
          ),
          runtimeConfig,
        }
      }).
      then(({ result, runtimeConfig }) => {
        if (generation !== this.generation || this.isDisposed()) {
          this.closeResult(result)
          throw new Error('TypecheckingService was disposed during board switch')
        }
        this.client = result.client
        this.transport = result.transport
        this.workspaceDiagnosticsSubscription = result.workspaceDiagnosticsSubscription || null
        // The replacement runtime is owned again, so later failures must close it.
        runtimeHandedOver = false
        this.selectedStubBundle = runtimeConfig.stubBundle
        this.requestedConfig = requestedConfig
        this.runtimeConfig = runtimeConfig
        this.clientConfig = {
          ...requestedConfig,
          ...runtimeConfig,
          onWorkspaceDiagnosticsChange: diagnostics => this.setWorkspaceDiagnosticStatus(diagnostics),
        }
        this.rebindEditors()
        this.setStatus('ready', null)
        return true
      }).
      catch(error => {
        if (generation === this.generation && !this.isDisposed()) {
          try {
            if (runtimeHandedOver) {
              this.forgetRuntime()
            } else {
              this.closeRuntime()
            }
          } catch (teardownError) {
            // Teardown must never mask why the switch failed.
            console.warn('Type-checking runtime teardown failed:', teardownError)
          }
          this.setStatus('error', error)
        }
        throw error
      }).
      finally(() => {
        this.switching = null
      })
    return this.switching
  }

  requireStubPackageTransport() {
    if (this.status !== 'ready' || !this.transport) {
      throw new Error('TypecheckingService must be ready to manage stub packages')
    }
    return this.transport
  }

  async runStubPackageQuery(query) {
    if (this.hasPendingLifecycle()) { await this.settleLifecycle() }
    let transport = this.requireStubPackageTransport()
    for (let attempt = 1; ; attempt++) {
      try {
        return await query(transport)
      } catch (error) {
        if (attempt >= STUB_PACKAGE_QUERY_MAX_ATTEMPTS) { throw error }
        await this.settleLifecycle()
        // Retry only when a runtime replacement actually happened; an argument-validation
        // or genuine transport rejection must surface as-is, not be silently retried away.
        const replacedTransport = this.status === 'ready' ? this.transport : null
        if (!replacedTransport || replacedTransport === transport) { throw error }
        transport = replacedTransport
      }
    }
  }

  /**
   * Query catalog packages and current PyPI releases.
   *
   * Read-only queries wait for and retry across an in-progress runtime replacement.
   *
   * @returns {Promise<object[]>} Worker package catalog.
   */
  listStubPackages(filters = {}) {
    return this.runStubPackageQuery(transport => transport.listStubPackages(filters))
  }

  /**
   * Query catalog packages together with available and default runtime versions.
   *
   * @param {{family?: string, version?: string, port?: string, board?: string}} [filters={}]
   * @returns {Promise<object>} Published worker package catalog response.
   */
  getStubPackageCatalog(filters = {}) {
    return this.runStubPackageQuery(transport => transport.getStubPackageCatalog(filters))
  }

  /**
   * List stub packages persisted by the worker.
   *
   * @returns {Promise<object[]>} Installed package metadata.
   */
  listInstalledStubPackages() {
    return this.runStubPackageQuery(transport => transport.listInstalledStubPackages())
  }

  /**
   * Replace the runtime while preserving service configuration and editor bindings.
   *
   * @param {object|null} [requestedConfig=null] Complete host-requested config, or null to reuse it.
   * @returns {Promise<TypecheckingSnapshot>} Ready replacement snapshot.
   */
  async restartRuntime(requestedConfig = null) {
    if (this.isDisposed()) {
      throw new Error('TypecheckingService is disposed')
    }
    if (this.restarting) { return this.restarting }
    const config = requestedConfig === null
      ? { ...this.requestedConfig }
      : { ...requestedConfig }
    this.restarting = (async () => {
      this.disable({ preserveEditorExtensions: true })
      await this.initialize(config)
      return this.snapshot()
    })()
    try {
      return await this.restarting
    } finally {
      this.restarting = null
    }
  }

  /**
   * Install a PyPI stub wheel and, by default, restart Pyright to mount it.
   *
   * Callers that immediately reconfigure the runtime themselves (for example,
   * autoselect resolving and mounting a board package in one pass) can pass
   * `{ restart: false }` to avoid a redundant intermediate restart.
   *
   * @param {string} packageName PyPI package name.
   * @param {string} [versionSpecifier=''] Optional version constraint.
   * @param {{restart?: boolean}} [options={}] Restart behavior.
   * @returns {Promise<object>} Installed package metadata.
   */
  async installStubPackage(packageName, versionSpecifier = '', { restart = true } = {}) {
    if (this.hasPendingLifecycle()) { await this.settleLifecycle() }
    const installed = await this.requireStubPackageTransport().
      installStubPackage(packageName, versionSpecifier)
    if (restart) {
      await this.restartRuntime()
    }
    return installed
  }

  /**
   * Clear cached stubs and restart Pyright when required.
   *
   * @param {string} [packageName] Package to clear, or omit for all packages.
   * @param {string} [version] Exact version to clear.
   * @returns {Promise<{removed: number, restartRequired: boolean}>} Clear result.
   */
  async clearStubPackages(packageName, version) {
    if (this.hasPendingLifecycle()) { await this.settleLifecycle() }
    const result = await this.requireStubPackageTransport().
      clearStubPackages(packageName, version)
    if (result.restartRequired) {
      await this.restartRuntime()
    }
    return result
  }

  rebindEditors() {
    this.documentVersions.clear()
    this.diagnosticStatus.clear()
    // Open buffers are newer than the mirror whenever edits arrived while the runtime was down.
    for (const [editorView, binding] of this.editorBindings) {
      this.setWorkspaceFile(this.workspacePath(binding.path), editorView.state.doc.toString(), false)
    }
    this.syncWorkspaceSnapshot()
    const failedBindings = []
    for (const [editorView, binding] of [...this.editorBindings]) {
      const content = editorView.state.doc.toString()
      this.openDocument(binding.uri)
      const extensions = this.createEditorExtensions(editorView, binding.uri, content)
      if (!this.configureEditor(editorView, extensions)) {
        this.closeDocument(binding.uri)
        this.editorBindings.delete(editorView)
        failedBindings.push(binding.path)
      }
    }
    if (failedBindings.length) {
      throw new Error(`Editors do not support type checking: ${failedBindings.join(', ')}`)
    }
  }

  /**
   * Stop type checking without discarding registered editor bindings or workspace files.
   *
    * @param {{preserveEditorExtensions?: boolean}} [options={}] Keep the current editor
    * extensions installed while replacing the runtime.
   * @returns {boolean} Whether the service transitioned to disabled.
   */
  disable({ preserveEditorExtensions = false } = {}) {
    if (this.isDisposed() || this.status === 'disabled') { return false }
    if (this.status === 'starting' || this.status === 'switching') {
      throw new Error(`TypecheckingService cannot be disabled while ${this.status}`)
    }

    for (const [editorView, binding] of this.editorBindings) {
      if (this.client && this.documentVersions.has(binding.uri)) {
        this.notifyDocumentClose?.(this.client, binding.uri)
      }
      if (!preserveEditorExtensions) {
        this.configureEditor(editorView, [])
      }
    }

    this.closeRuntime()
    this.setStatus('disabled', null)
    return true
  }

  /**
   * Subscribe to lifecycle, diagnostics, and workspace snapshots.
   *
   * The listener is invoked immediately.
   *
   * @param {(snapshot: TypecheckingSnapshot) => void} listener Status listener.
   * @returns {() => boolean} Unsubscribe callback.
   */
  onStatusChange(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('TypecheckingService status listener must be a function')
    }
    // A disposed service retains no listeners but still reports its final state.
    if (this.isDisposed()) {
      listener(this.snapshot())
      return () => false
    }
    this.statusListeners.add(listener)
    listener(this.snapshot())
    return () => this.statusListeners.delete(listener)
  }

  setStatus(status, error) {
    this.status = status
    this.error = error
    this.emitStatus()
  }

  emitStatus() {
    if (!this.statusListeners.size) { return }
    const state = this.snapshot()
    for (const listener of this.statusListeners) {
      try {
        listener(state)
      } catch (error) {
        console.error('Typechecking status listener failed:', error)
      }
    }
  }

  uriForPath(path) {
    return `file:///workspace/${this.workspacePath(path).split('/').map(encodeURIComponent).join('/')}`
  }

  workspacePath(path) {
    if (typeof path !== 'string' || !path.trim()) {
      throw new TypeError('Document path is required')
    }
    const relative = path.replace(/^\/+/, '')
    const segments = relative.split('/')
    if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
      throw new TypeError(`Invalid document path: ${path}`)
    }
    return segments.join('/')
  }

  changeDocument(uri) {
    const version = this.documentVersions.get(uri)
    if (version === undefined) {
      throw new Error(`Document is not open: ${uri}`)
    }
    const next = version + 1
    this.documentVersions.set(uri, next)
    return next
  }

  closeDocument(uri) {
    this.documentVersions.delete(uri)
    this.diagnosticStatus.delete(uri)
  }

  setWorkspaceDiagnosticStatus(diagnostics) {
    this.diagnosticStatus.clear()
    for (const diagnostic of diagnostics) {
      const uri = diagnostic.uri
      if (!this.diagnosticStatus.has(uri)) {
        this.diagnosticStatus.set(uri, [])
      }
      this.diagnosticStatus.get(uri).push({
        ...diagnostic,
        source: diagnostic.source || 'Pyright',
      })
    }
    this.emitStatus()
  }

  /**
   * Return current service state with detached map containers.
   *
   * Diagnostic objects and clients remain shared references and must be treated
   * as read-only by status consumers.
   *
   * @returns {TypecheckingSnapshot} Current state snapshot.
   */
  snapshot() {
    // Return new maps so status consumers cannot mutate service-owned state.
    return {
      status: this.status,
      error: this.error,
      client: this.client,
      transport: this.transport,
      selectedStubBundle: this.selectedStubBundle,
      typeCheckingMode: this.requestedConfig?.typeCheckingMode || 'standard',
      diagnosticMode: this.requestedConfig?.diagnosticMode || 'openFilesOnly',
      runtimeSource: this.runtimeSource,
      runtimeId: this.runtimeId,
      runtimeManifest: this.runtimeManifest ? structuredClone(this.runtimeManifest) : null,
      runtimeFallbacks: structuredClone(this.runtimeFallbacks),
      documentVersions: new Map(this.documentVersions),
      diagnosticStatus: new Map(this.diagnosticStatus),
      workspaceFiles: new Map(this.workspaceFiles),
    }
  }

  /**
   * Permanently close the service and release worker-owned resources and listeners.
   *
   * Hosts should unbind or destroy editors first when their CodeMirror
   * compartments also need to be cleared.
   *
   * @returns {void}
   */
  dispose() {
    if (this.isDisposed()) { return }
    this.generation++
    this.setStatus('disposed', null)
    this.closeRuntime()
    this.editorBindings.clear()
    this.workspaceFiles.clear()
    this.statusListeners.clear()
  }

  closeResult({
    client,
    transport,
    workspaceDiagnosticsSubscription = this.workspaceDiagnosticsSubscription,
  } = {}) {
    workspaceDiagnosticsSubscription?.destroy()
    if (workspaceDiagnosticsSubscription === this.workspaceDiagnosticsSubscription) {
      this.workspaceDiagnosticsSubscription = null
    }
    const disconnecting = client?.disconnect()
    if (disconnecting && typeof disconnecting.finally === 'function') {
      void disconnecting.finally(() => transport?.close())
    } else {
      transport?.close()
    }
  }

  closeRuntime() {
    this.closeResult({ client: this.client, transport: this.transport })
    this.forgetRuntime()
  }

  /** Drop runtime references without closing them, for a runtime another owner tore down. */
  forgetRuntime() {
    this.client = null
    this.transport = null
    this.workspaceDiagnosticsSubscription = null
    this.selectedStubBundle = null
    this.runtimeConfig = null
    this.clientConfig = null
    this.runtimeSource = null
    this.runtimeId = null
    this.runtimeManifest = null
    this.runtimeFallbacks = []
    this.documentVersions.clear()
    this.diagnosticStatus.clear()
  }
}
