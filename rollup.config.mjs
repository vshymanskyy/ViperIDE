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

// build.py defaults this to the production URL and passes it via the environment.
// When running Rollup directly, it has to be set explicitly.
const BASE_URL = process.env.VIPER_IDE_BASE_URL
if (!BASE_URL) {
  throw new Error('VIPER_IDE_BASE_URL is not set, i.e. VIPER_IDE_BASE_URL=http://localhost:10001 npm start')
}

const copyHtml = (src, dst) => {
  fs.writeFileSync(dst, fs.readFileSync(src, 'utf8').replaceAll('${VIPER_IDE_BASE_URL}', BASE_URL))
}

copyHtml('src/ViperIDE.html',  'build/index.html')
copyHtml('src/benchmark.html', 'build/benchmark.html')
copyHtml('src/bridge.html',    'build/bridge.html')

const common = (args, name) => ({
  output: {
    name,
    dir: 'build',
    format: 'iife',
    indent: false,
    sourcemap: args.configDebug,
  },
  context: 'window',
  onwarn: (warning, _warn) => {
    throw new Error(warning.message)
  },
  plugins: [
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
    !args.configDebug && terser(),
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
