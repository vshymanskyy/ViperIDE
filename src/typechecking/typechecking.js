/*
 * SPDX-FileCopyrightText: 2026 Jos Verlinde
 * SPDX-License-Identifier: MIT
 */

import {
  createLSPClient,
  createLSPPlugin,
  notifyDocumentChange,
  notifyDocumentClose,
  switchBoard,
} from '@mp-typing/lsp-client'

import { TypecheckingService } from './typechecking_service.js'
import { bundledStubPackageEntry, typecheckingAssets } from './typechecking_assets.js'

/** One service instance owns the worker and all editor bindings for this application session. */
export const typechecking = new TypecheckingService({
  createLSPClient,
  createLSPPlugin,
  notifyDocumentChange,
  notifyDocumentClose,
  switchBoard,
  prepareRuntime: config => typecheckingAssets.prepare(config),
})

/** @returns {Promise<{default: string, boards: object[]}>} Published worker stub manifest. */
export const loadTypecheckingStubManifest = () => typecheckingAssets.loadManifest()

export const isTypecheckingStubPackageBundled = async stubPackage =>
  Boolean(bundledStubPackageEntry(await loadTypecheckingStubManifest(), stubPackage))
