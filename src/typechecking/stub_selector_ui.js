/*
 * SPDX-FileCopyrightText: 2026 Jos Verlinde
 * SPDX-License-Identifier: MIT
 */

import toastr from 'toastr'

import { getSetting, onSettingChange, updateSetting } from '../settings.js'
import { QID } from '../utils_browser.js'
import { isTypecheckingStubPackageBundled, typechecking } from './typechecking.js'
import {
  formatStubLabel,
  formatStubSpecifier,
  parseStubPackageSpecifier,
  typecheckingAutodetectFallback,
  typecheckingStubPreferences,
} from './typechecking_settings.js'

const STUB_SELECTOR_IDS = [
  'typecheck-stub-family',
  'typecheck-stub-version',
  'typecheck-stub-port',
  'typecheck-stub-board',
]
const TYPECHECK_TOGGLE_IDS = [
  'typecheck-mode',
  'typecheck-scope',
  'typecheck-autodetect',
  'typecheck-viper-tools-stubs',
]

function preferredValue(candidates, ...fallbacks) {
  return fallbacks.find(value => candidates.includes(value)) ?? candidates[0] ?? ''
}

function stubValues(packages, key) {
  return [...new Set(packages.map(entry => entry[key]).filter(Boolean))].sort()
}

export function createTypecheckingStubSelector({ getDeviceInfo, requestReconfiguration, translate, updateUI }) {
  let selectedPackage = null
  let syncing = false
  let pendingRefresh = false
  let autodetectNotice = ''

  function replaceOptions(id, values, preferred, emptyLabel) {
    const select = QID(id)
    const options = values.length ? values : ['']
    select.replaceChildren(...options.map(value => new Option(value || emptyLabel(), value)))
    const selected = preferredValue(values, preferred)
    select.value = selected
    if (getSetting(id) !== selected) { updateSetting(id, selected) }
    return selected
  }

  function updateApplicability() {
    const applicable = getSetting('typecheck-stub-family') !== 'circuitpython'
    const editable = getSetting('typecheck-enabled')
            && ['ready', 'error'].includes(typechecking.snapshot().status)
    const autodetect = getSetting('typecheck-autodetect')
    QID('typecheck-stub-family').disabled = !editable || autodetect
    for (const id of STUB_SELECTOR_IDS.slice(1)) {
      QID(id).disabled = !editable || !applicable || autodetect
    }
  }

  function updateControls(snapshot = typechecking.snapshot()) {
    const enabled = getSetting('typecheck-enabled')
    const packageControlsEnabled = enabled && snapshot.status === 'ready'
    for (const id of TYPECHECK_TOGGLE_IDS) {
      QID(id).disabled = !enabled
    }
    QID('typecheck-stub-package').disabled = !packageControlsEnabled
    QID('typecheck-stub-install').disabled = !packageControlsEnabled
    QID('typecheck-stub-clear').disabled = !packageControlsEnabled
    updateApplicability()
    if (!enabled) {
      setStatus('Enable type checking to view or manage cached stub packages.')
    }
  }

  async function updateSelectors() {
    let result
    do {
      pendingRefresh = false
      result = await updateSelectorsOnce()
    } while (pendingRefresh)
    return result
  }

  async function updateSelectorsOnce() {
    if (getSetting('typecheck-enabled') && typechecking.snapshot().status === 'error') {
      await requestReconfiguration()
    }
    const devInfo = getDeviceInfo()
    const autodetect = getSetting('typecheck-autodetect') && devInfo
    const detectedFamily = String(devInfo?.family || '').toLowerCase()
    const family = (autodetect ? detectedFamily : getSetting('typecheck-stub-family')) === 'circuitpython'
      ? 'circuitpython'
      : 'micropython'
    syncing = true
    try {
      QID('typecheck-stub-family').value = family
      if (getSetting('typecheck-stub-family') !== family) {
        updateSetting('typecheck-stub-family', family)
      }
      const catalog = await typechecking.getStubPackageCatalog({ family })
      const preferences = autodetect
        ? typecheckingStubPreferences(devInfo, catalog.packages, catalog.defaultRuntimeVersion)
        : null
      const fallback = preferences ? typecheckingAutodetectFallback(devInfo, preferences) : null
      const fallbackKey = fallback?.message || ''
      if (fallback && fallbackKey !== autodetectNotice) {
        toastr[fallback.level](fallback.message, 'Type stubs')
      }
      autodetectNotice = fallbackKey
      if (autodetect && family === 'micropython' && !preferences.port) {
        updateApplicability()
        return catalog.packages
      }
      const versions = family === 'micropython' ? catalog.availableRuntimeVersions : []
      const version = replaceOptions(
        'typecheck-stub-version',
        versions,
        preferences?.version || getSetting('typecheck-stub-version') || catalog.defaultRuntimeVersion,
        () => translate('settings.typecheck-stub-not-applicable'),
      )
      const familyFilters = { family, ...(version ? { version } : {}) }
      const portPackages = await typechecking.listStubPackages(familyFilters)
      const ports = family === 'micropython' ? stubValues(portPackages, 'port') : []
      const port = replaceOptions(
        'typecheck-stub-port',
        ports,
        preferences ? preferences.port : getSetting('typecheck-stub-port'),
        () => translate('settings.typecheck-stub-not-applicable'),
      )
      const boardPackages = await typechecking.listStubPackages({
        ...familyFilters,
        ...(port ? { port } : {}),
      })
      const boards = family === 'micropython' ? stubValues(boardPackages, 'board') : []
      const board = replaceOptions(
        'typecheck-stub-board',
        boards,
        preferredValue(
          boards,
          preferences?.board,
          getSetting('typecheck-stub-board'),
          'GENERIC',
        ),
        () => translate('settings.typecheck-stub-not-applicable'),
      )
      const packages = await typechecking.listStubPackages({
        ...familyFilters,
        ...(port ? { port } : {}),
        ...(board ? { board } : {}),
      })
      const target = packages[0] || null
      selectedPackage = target ? {
        packageName: target.packageName,
        version: target.installedVersion || target.latestVersion,
      } : null
      QID('typecheck-stub-selected-package').value = selectedPackage
        ? formatStubSpecifier(selectedPackage.packageName, selectedPackage.version)
        : ''
      updateApplicability()
      return catalog.packages
    } finally {
      syncing = false
    }
  }

  function setStatus(message) {
    QID('typecheck-stub-status').textContent = message
  }

  async function refreshCachedStatus() {
    const installed = await typechecking.listInstalledStubPackages()
    const active = installed.filter(entry => entry.active)
    setStatus(active.length
      ? `Cached: ${active.map(entry => formatStubLabel(entry.packageName, entry.version)).join(', ')}`
      : 'No cached stub packages.')
    return installed
  }

  async function refreshPackages() {
    const catalog = await updateSelectors()
    await refreshCachedStatus()
    const dataList = QID('typecheck-stub-catalog')
    dataList.replaceChildren()
    for (const stubPackage of catalog) {
      for (const release of stubPackage.versions || []) {
        const specifier = formatStubSpecifier(stubPackage.packageName, release.version)
        const option = new Option(
          specifier,
          specifier,
        )
        option.label = stubPackage.label
        dataList.appendChild(option)
      }
    }
  }

  async function installPackage() {
    const input = QID('typecheck-stub-package')
    const specifier = parseStubPackageSpecifier(input.value)
    QID('typecheck-stub-install').disabled = true
    setStatus(`Installing ${specifier.packageName}...`)
    try {
      const installed = await typechecking.installStubPackage(
        specifier.packageName,
        specifier.versionSpecifier,
      )
      input.value = ''
      await refreshPackages()
      setStatus(`Installed ${formatStubLabel(installed.packageName, installed.version)}`)
    } catch (err) {
      setStatus(`Could not install ${specifier.packageName}: ${err.message}`)
      throw err
    } finally {
      updateUI()
    }
  }

  async function clearPackages() {
    QID('typecheck-stub-clear').disabled = true
    setStatus('Clearing cached stub packages...')
    try {
      await typechecking.clearStubPackages()
      await refreshPackages()
    } catch (err) {
      setStatus(`Could not clear cached stub packages: ${err.message}`)
      throw err
    } finally {
      updateUI()
    }
  }

  async function ensureAutoselectedInstalled() {
    if (!getSetting('typecheck-autodetect') || !getSetting('typecheck-enabled')) { return }
    const target = selectedPackage
    if (!target?.packageName || !target.version) { return }
    if (await isTypecheckingStubPackageBundled(target)) { return }
    try {
      const installed = await typechecking.listInstalledStubPackages()
      const cached = installed.find(entry =>
        entry.active &&
                entry.packageName === target.packageName &&
                entry.version === target.version)
      if (cached) { return }
      setStatus(`Installing ${formatStubLabel(target.packageName, target.version)}...`)
      const specifier = parseStubPackageSpecifier(
        formatStubSpecifier(target.packageName, target.version),
      )
      await typechecking.installStubPackage(
        specifier.packageName,
        specifier.versionSpecifier,
        { restart: false },
      )
      await refreshCachedStatus()
    } catch (err) {
      const port = getSetting('typecheck-stub-port') || 'bundled'
      console.warn(`Could not install ${formatStubLabel(target.packageName, target.version)}:`, err)
      toastr.warning(
        `Could not install ${target.packageName}; using bundled ${port} stubs.`,
        'Type stubs',
      )
      setStatus(
        `Could not install ${formatStubLabel(target.packageName, target.version)}; using bundled ${port} stubs.`)
    }
  }

  function wire({ queueWork, queueDeviceSelection, applyReconfiguration }) {
    onSettingChange('typecheck-autodetect', () => {
      updateApplicability()
      queueDeviceSelection()
    })
    for (const id of STUB_SELECTOR_IDS) {
      onSettingChange(id, () => {
        if (syncing) { pendingRefresh = true; return }
        queueWork(
          () => updateSelectors().then(() => applyReconfiguration()),
          'Unable to select type stubs',
        )
      })
    }
    QID('typecheck-stub-install').addEventListener('click', () => {
      queueWork(installPackage, 'Unable to install type stubs')
    })
    QID('typecheck-stub-clear').addEventListener('click', () => {
      queueWork(clearPackages, 'Unable to clear cached type stubs')
    })
    QID('typecheck-stub-package').addEventListener('keydown', event => {
      if (event.key === 'Enter') { QID('typecheck-stub-install').click() }
    })
  }

  return {
    clearPackages,
    ensureAutoselectedInstalled,
    getSelectedPackage: () => selectedPackage,
    installPackage,
    refreshPackages,
    updateApplicability,
    updateControls,
    updateSelectors,
    wire,
  }
}
