import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import postcss from 'rollup-plugin-postcss'
import terser from '@rollup/plugin-terser'

const debug = (cfg) => Object.assign(cfg, {
  output: Object.assign(cfg.output, {
    indent: false,
  }),
  treeshake: false,
})

const release = (cfg) => Object.assign(cfg, {
  plugins: [
    ...cfg.plugins,
    terser()
  ]
})

const common = (name) => release({
  output: {
    name,
    dir: 'build',
    format: 'iife',
  },
  context: 'window',
  onwarn: (warning, _warn) => {
    throw new Error(warning.message)
  },
  plugins: [
    postcss({
      extract: `${name}.css`,
      minimize: true,
    }),
    nodeResolve(),
    commonjs(),
    json({
      compact: true
    }),
  ]
})

export default [{
  input: './src/app.js',
  ...common('app')
},{
  input: './src/viper_lib.js',
  ...common('viper_lib')
}]
