import { strict as assert } from 'node:assert'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'

import {
    discoverLocalPackages,
    localPackageEnvironment,
    npmExecutable,
    runWithLocalPackages,
} from '../../scripts/build-local.mjs'

function createWorkspace() {
    const root = mkdtempSync(join(tmpdir(), 'viper-local-packages-'))
    const packages = join(root, 'packages')
    const lspClient = join(packages, 'lsp-client')
    const pyrightWorker = join(packages, 'pyright-worker')
    mkdirSync(lspClient, { recursive: true })
    mkdirSync(pyrightWorker, { recursive: true })
    writeFileSync(join(root, 'package.json'), JSON.stringify({
        scripts: { 'build:worker:dev': 'webpack --mode development' },
    }))
    writeFileSync(join(lspClient, 'package.json'), JSON.stringify({ name: '@mp-typing/lsp-client' }))
    writeFileSync(join(pyrightWorker, 'package.json'), JSON.stringify({ name: '@mp-typing/pyright-worker' }))
    return { root, packages, lspClient, pyrightWorker }
}

describe('local package build', () => {
    it('discovers packages from workspace, packages, package, and manifest paths', () => {
        const workspace = createWorkspace()
        for (const input of [
            workspace.root,
            workspace.packages,
            workspace.lspClient,
            workspace.pyrightWorker,
            join(workspace.pyrightWorker, 'package.json'),
        ]) {
            assert.deepEqual(discoverLocalPackages(input), {
                lspClient: workspace.lspClient,
                pyrightWorker: workspace.pyrightWorker,
                workspaceRoot: workspace.root,
            })
        }
    })

    it('resolves relative paths against the requested base directory', () => {
        const workspace = createWorkspace()
        assert.equal(discoverLocalPackages('packages', workspace.root).workspaceRoot, workspace.root)
    })

    it('rejects directories without both expected packages', () => {
        const root = mkdtempSync(join(tmpdir(), 'viper-not-packages-'))
        assert.throws(() => discoverLocalPackages(root), /Could not find/)
    })

    it('selects the platform-specific npm executable', () => {
        assert.equal(npmExecutable('linux'), 'npm')
        assert.equal(npmExecutable('win32'), 'npm.cmd')
    })

    it('passes local package paths without replacing the rest of the environment', () => {
        const workspace = createWorkspace()
        const environment = localPackageEnvironment({
            lspClient: workspace.lspClient,
            pyrightWorker: workspace.pyrightWorker,
        }, { EXISTING: 'value' })

        assert.deepEqual(environment, {
            EXISTING: 'value',
            VIPER_IDE_LOCAL_LSP_CLIENT_PACKAGE: workspace.lspClient,
            VIPER_IDE_LOCAL_PYRIGHT_WORKER_PACKAGE: workspace.pyrightWorker,
        })
    })

    it('builds the worker before build, start, and browser-test commands', () => {
        const workspace = createWorkspace()
        const projectRoot = mkdtempSync(join(tmpdir(), 'viper-project-'))

        for (const mode of ['build', 'start', 'test']) {
            const calls = []
            runWithLocalPackages(mode, workspace.root, {
                projectRoot,
                environment: { EXISTING: 'value' },
                run(command, args, options) { calls.push({ command, args, options }) },
            })

            assert.deepEqual(calls[0].args, ['run', 'build:worker:dev'])
            assert.deepEqual(calls[1].args, ['run', mode === 'start' ? 'start' : 'build'])
            assert.equal(calls[1].options.env.VIPER_IDE_LOCAL_LSP_CLIENT_PACKAGE, workspace.lspClient)
            assert.equal(calls[1].options.env.VIPER_IDE_LOCAL_PYRIGHT_WORKER_PACKAGE, workspace.pyrightWorker)
            if (mode === 'test') {
                assert.deepEqual(calls[2], {
                    command: npmExecutable(),
                    args: ['run', 'test:browser'],
                    options: { cwd: projectRoot, env: calls[1].options.env },
                })
            } else {
                assert.equal(calls.length, 2)
            }
        }
    })

    it('rejects unsupported local command modes', () => {
        const workspace = createWorkspace()
        assert.throws(() => runWithLocalPackages('serve', workspace.root), /Unsupported local package mode/)
    })
})