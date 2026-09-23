import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const PACKAGE_NAMES = Object.freeze({
  lspClient: '@mp-typing/lsp-client',
  pyrightWorker: '@mp-typing/pyright-worker',
})
const MODES = new Set(['build', 'start', 'test'])

function packageName(directory) {
  const manifest = join(directory, 'package.json')
  if (!existsSync(manifest)) { return '' }
  return JSON.parse(readFileSync(manifest, 'utf8')).name || ''
}

function inputDirectory(input, baseDirectory) {
  const absolute = resolve(baseDirectory, input)
  return existsSync(absolute) && statSync(absolute).isFile() ? dirname(absolute) : absolute
}

export function discoverLocalPackages(input, baseDirectory = process.cwd()) {
  const directory = inputDirectory(input, baseDirectory)
  const candidates = [
    directory,
    join(directory, 'packages'),
    dirname(directory),
  ]

  for (const packagesDirectory of candidates) {
    const directName = packageName(directory)
    const lspClient = directName === PACKAGE_NAMES.lspClient
      ? directory
      : join(packagesDirectory, 'lsp-client')
    const pyrightWorker = directName === PACKAGE_NAMES.pyrightWorker
      ? directory
      : join(packagesDirectory, 'pyright-worker')
    const siblingLspClient = directName === PACKAGE_NAMES.pyrightWorker
      ? join(dirname(directory), 'lsp-client')
      : lspClient
    const siblingPyrightWorker = directName === PACKAGE_NAMES.lspClient
      ? join(dirname(directory), 'pyright-worker')
      : pyrightWorker

    if (packageName(siblingLspClient) === PACKAGE_NAMES.lspClient &&
        packageName(siblingPyrightWorker) === PACKAGE_NAMES.pyrightWorker) {
      const packagesRoot = dirname(siblingLspClient)
      const workspaceRoot = dirname(packagesRoot)
      const workspaceManifest = JSON.parse(readFileSync(join(workspaceRoot, 'package.json'), 'utf8'))
      if (!workspaceManifest.scripts?.['build:worker:dev']) {
        throw new Error(`Local package workspace has no build:worker:dev script: ${workspaceRoot}`)
      }
      return { lspClient: siblingLspClient, pyrightWorker: siblingPyrightWorker, workspaceRoot }
    }
  }

  throw new Error(
    `Could not find ${PACKAGE_NAMES.lspClient} and ${PACKAGE_NAMES.pyrightWorker} below ${directory}`,
  )
}

export function npmExecutable(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm'
}

export function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false, ...options })
  if (result.error) { throw result.error }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

export function localPackageEnvironment(packages, environment = process.env) {
  return {
    ...environment,
    VIPER_IDE_LOCAL_LSP_CLIENT_PACKAGE: packages.lspClient,
    VIPER_IDE_LOCAL_PYRIGHT_WORKER_PACKAGE: packages.pyrightWorker,
  }
}

export function runWithLocalPackages(mode, input, options = {}) {
  if (!MODES.has(mode)) { throw new Error(`Unsupported local package mode: ${mode}`) }
  const projectRoot = options.projectRoot || dirname(dirname(fileURLToPath(import.meta.url)))
  const packages = discoverLocalPackages(input, options.baseDirectory || process.env.INIT_CWD || projectRoot)
  const npm = npmExecutable(options.platform)
  const execute = options.run || run
  const environment = localPackageEnvironment(packages, options.environment)

  console.log(`Building worker from ${packages.workspaceRoot}`)
  execute(npm, ['run', 'build:worker:dev'], { cwd: packages.workspaceRoot })

  console.log(`${mode === 'start' ? 'Starting' : 'Building'} ViperIDE with local packages from ${dirname(packages.lspClient)}`)
  execute(npm, ['run', mode === 'start' ? 'start' : 'build'], {
    cwd: projectRoot,
    env: environment,
  })

  if (mode === 'test') {
    console.log('Running ViperIDE browser tests against the local-package build')
    execute(npm, ['run', 'test:browser'], { cwd: projectRoot, env: environment })
  }
}

export function buildFromLocalPackages(input, options = {}) {
  return runWithLocalPackages('build', input, options)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  const mode = process.argv[2]
  const input = process.argv[3]
  if (!MODES.has(mode) || !input) {
    console.error('Usage: node scripts/build-local.mjs <build|start|test> <workspace-root|packages-directory|package-directory>')
    process.exitCode = 2
  } else {
    try {
      runWithLocalPackages(mode, input)
    } catch (error) {
      console.error(error.message)
      process.exitCode = 1
    }
  }
}