import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import postcss from 'rollup-plugin-postcss'
import terser from '@rollup/plugin-terser'
//import { eslint } from 'rollup-plugin-eslint'

const common = (name) => ({
  context: 'window',
  onwarn: (warning, warn) => {
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
    terser(),
  ]
})

export default [{
  input: './src/app.js',
  output: {
    name: 'app',
    dir: 'build',
    format: 'iife',
  },
  ...common('app')
},{
  input: './src/viper_lib.js',
  output: {
    name: 'viper',
    dir: 'build',
    format: 'iife',
  },
  ...common('viper_lib')
}]
