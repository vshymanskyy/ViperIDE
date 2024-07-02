import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import postcss from 'rollup-plugin-postcss'
import terser from '@rollup/plugin-terser'
//import { eslint } from 'rollup-plugin-eslint'

export default [{
  input: './src/app.js',
  output: {
    name: 'app',
    dir: 'build',
    format: 'iife',
  },
  plugins: [
    postcss({
      extract: 'app.css',
      minimize: true,
    }),
    nodeResolve(),
    commonjs(),
    json({
      compact: true
    }),
    terser(),
  ]
},{
  input: './src/viper_lib.js',
  output: {
    name: 'viper',
    dir: 'build',
    format: 'iife',
  },
  plugins: [
    nodeResolve(),
    commonjs(),
    json(),
    terser(),
  ]
}]
