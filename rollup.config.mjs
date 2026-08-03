import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import replace from '@rollup/plugin-replace'
import terser from '@rollup/plugin-terser'
import css from 'rollup-plugin-import-css'
import serve from 'rollup-plugin-serve'
import sourcemaps from 'rollup-plugin-sourcemaps2';
import fs from 'fs'

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))

// build.py passes this via the environment. When running Rollup directly,
// default to the local development server.
const BASE_URL = process.env.VIPER_IDE_BASE_URL || 'http://localhost:10001'

const copyHtml = (src, dst) => {
  let data = fs.readFileSync(src, 'utf8').
      replaceAll('${VIPER_IDE_BASE_URL}', BASE_URL).
      replaceAll('${VIPER_IDE_DESCR}', pkg.description)
  fs.writeFileSync(dst, data)
}

// The MicroPython WASM package ships a single .mjs that doubles as a Node CLI
// entry point. That bootstrap uses top-level await, which an IIFE bundle cannot
// express, so it has to go - it is unreachable in a browser anyway. The anchors
// are minified vendor code: fail loudly if a package update moves them.
const MPY_MODULE = '@micropython/micropython-webassembly-pyscript/micropython.mjs'

const stripMicroPythonNodeCli = () => ({
  name: 'strip-micropython-node-cli',
  transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith(MPY_MODULE)) { return null }
    // `if (globalThis.loadMicroPython = loadMicroPython, <is node>) { ...cli... }`
    // The global assignment is smuggled into the condition, so keep it separately.
    const start = code.indexOf('if(globalThis.loadMicroPython=loadMicroPython,')
    const end = code.indexOf('class PyProxy{', start)
    if (start < 0 || end < 0) {
      throw new Error(`${MPY_MODULE}: failed to strip the Node CLI bootstrap`)
    }
    return {
      code: code.slice(0, start) + 'globalThis.loadMicroPython=loadMicroPython;' + code.slice(end),
      map: null,
    }
  },
  // Emscripten reads import.meta.url to locate micropython.wasm next to itself.
  // Bundled, there is no "itself" - and every call site passes an explicit URL -
  // so the page URL is a harmless stand-in.
  resolveImportMeta(property) {
    return property === 'url' ? 'document.baseURI' : null
  },
})

copyHtml('src/ViperIDE.html',  'build/index.html')
copyHtml('src/benchmark.html', 'build/benchmark.html')
copyHtml('src/bridge.html',    'build/bridge.html')

const common = (args, name) => ({
  output: {
    name,
    dir: 'build',
    format: 'iife',
    // mpy-cross-wasm loads its per-ABI Emscripten modules through dynamic import;
    // an IIFE cannot code-split, so they are bundled in along with everything else.
    inlineDynamicImports: true,
    indent: false,
    sourcemap: args.configDebug,
  },
  context: 'window',
  // Node built-ins are only reached from MicroPython's ENVIRONMENT_IS_NODE branch
  external: [/^node:/],
  onwarn: (warning, _warn) => {
    throw new Error(warning.message)
  },
  plugins: [
    stripMicroPythonNodeCli(),
    css({
      output: `${name}.css`,
      minify: !args.configDebug,
    }),
    resolve(),
    commonjs(),
    json({
      compact: true
    }),
    replace({
      preventAssignment: true,
      values: {
        VIPER_IDE_VERSION:  '"' + pkg.version + '"',
        VIPER_IDE_BUILD:    Date.now(),
        VIPER_IDE_BASE_URL: '"' + BASE_URL + '"',
      }
    }),
    args.configDebug && sourcemaps(),
    !args.configDebug && terser({
        format: {
          comments: false
        }
    }),
    args.configDebug && serve("build"),
  ]
})

export default args => [{
  input: './src/app.js',
  ...common(args, 'app')
},{
  input: './src/viper_lib.js',
  ...common(args, 'viper_lib')
},{
  input: './src/app_worker.js',
  ...common(args, 'app_worker')
}]
