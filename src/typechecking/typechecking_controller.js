/*
 * SPDX-FileCopyrightText: 2026 Jos Verlinde
 * SPDX-License-Identifier: MIT
 */

import { getSetting, onSettingChange, updateSetting } from '../settings.js'
import { report } from '../utils.js'
import { typechecking } from './typechecking.js'
import { catalogTypecheckingRuntimeConfig } from './typechecking_settings.js'

const EXTRA_PATHS = ['/workspace/lib']

export function createTypecheckingController({ stubSelector, syncWorkspace, updateUI }) {
  let action = Promise.resolve()
  let pendingWork = 0

  function currentConfig() {
    return {
      ...catalogTypecheckingRuntimeConfig({
        mode: getSetting('typecheck-mode'),
        scope: getSetting('typecheck-scope'),
        family: getSetting('typecheck-stub-family'),
        port: getSetting('typecheck-stub-port'),
        stubPackage: stubSelector.getSelectedPackage(),
        extraPaths: EXTRA_PATHS,
      }),
      viperToolsStubs: getSetting('typecheck-viper-tools-stubs'),
      shutdownTimeout: 5_000,
    }
  }

  async function applySetting(enabled) {
    if (!enabled) {
      typechecking.disable()
      return
    }

    await typechecking.initialize(currentConfig())
    await stubSelector.refreshPackages().
      catch(err => report('Unable to load current type-stub packages', err))
    await stubSelector.ensureAutoselectedInstalled()
    if (stubSelector.getSelectedPackage()) {
      await typechecking.restartRuntime(currentConfig())
    }
    await syncWorkspace()
  }

  function queueWork(work, failureMessage) {
    pendingWork++
    updateUI()
    action = action.
      then(work).
      catch(err => report(failureMessage, err)).
      finally(() => {
        pendingWork--
        updateUI()
      })
    return action
  }

  function queueSetting(enabled) {
    return queueWork(
      () => applySetting(enabled),
      enabled ? 'Unable to start type checking' : 'Unable to disable type checking',
    )
  }

  async function applyReconfiguration({ syncWorkspace: shouldSyncWorkspace = false } = {}) {
    if (!getSetting('typecheck-enabled')) { return }
    const status = typechecking.snapshot().status
    if (status !== 'idle' && status !== 'disabled') {
      await typechecking.restartRuntime(currentConfig())
    } else {
      await typechecking.initialize(currentConfig())
    }
    if (shouldSyncWorkspace) { await syncWorkspace() }
  }

  function queueReconfiguration(options = {}) {
    return queueWork(
      () => applyReconfiguration(options),
      'Unable to apply type-checking settings',
    )
  }

  function queueDeviceSelection() {
    if (!getSetting('typecheck-autodetect')) { return queueReconfiguration() }
    return queueWork(
      () => stubSelector.updateSelectors()
        .then(stubSelector.ensureAutoselectedInstalled)
        .then(() => applyReconfiguration()),
      'Unable to autodetect type stubs',
    )
  }

  function wire() {
    typechecking.onStatusChange(updateUI)
    onSettingChange('typecheck-enabled', queueSetting)
    onSettingChange('typecheck-mode', queueReconfiguration)
    onSettingChange('typecheck-scope', () =>
      queueReconfiguration({ syncWorkspace: true }))
    onSettingChange('typecheck-viper-tools-stubs', queueReconfiguration)
    stubSelector.wire({ queueWork, queueDeviceSelection, applyReconfiguration })
  }

  return {
    applyReconfiguration,
    getPendingWork: () => pendingWork,
    queueDeviceSelection,
    queueReconfiguration,
    queueSetting,
    queueWork,
    toggle: () => updateSetting('typecheck-enabled', !getSetting('typecheck-enabled')),
    wire,
  }
}
