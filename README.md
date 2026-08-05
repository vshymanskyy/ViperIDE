# ViperIDE

[![StandWithUkraine](https://raw.githubusercontent.com/vshymanskyy/StandWithUkraine/main/badges/StandWithUkraine.svg)](https://github.com/vshymanskyy/StandWithUkraine/blob/main/docs/README.md) 
[![GitHub Repo stars](https://img.shields.io/github/stars/vshymanskyy/ViperIDE?style=flat-square&color=green)](https://github.com/vshymanskyy/ViperIDE/stargazers) 
[![GitHub issues](https://img.shields.io/github/issues-raw/vshymanskyy/ViperIDE?style=flat-square&label=issues&color=green)](https://github.com/vshymanskyy/ViperIDE/issues) 
[![Build status](https://img.shields.io/github/actions/workflow/status/vshymanskyy/ViperIDE/static.yml?branch=main&style=flat-square&logo=github&label=build)](https://github.com/vshymanskyy/ViperIDE/actions) 
[![GitHub license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](https://github.com/vshymanskyy/ViperIDE) 
[![Support vshymanskyy](https://img.shields.io/static/v1?style=flat-square&label=support&message=%E2%9D%A4&color=%23fe8e86)](https://gist.github.com/vshymanskyy/840e6fa41ea6b028b91b333b6e4542ed) 

**An innovative [MicroPython](https://micropython.org) / [CircuitPython](https://circuitpython.org) IDE for Web and Mobile**

[![image](docs/images/visual-main.png)](https://viper-ide.org)

## Features

- **Lightweight and Accessible**
  - Runs entirely in your browser - no installation required
  - Works **offline** on both PC and smartphone
- **Flexible Connectivity**
  - Direct USB connection
  - Wireless/remote options available
- **Powerful Python Development**
  - Real-time code analysis: Spot errors and warnings instantly
  - Integrated Terminal/REPL for interactive coding
  - Basic code completion
  - MicroPython Virtual Machine for experimentation
- **Built-in Management Tools**
  - File explorer and editor
  - Package management system
- ... read more about [features and device support](./docs/Features.md)

## MCP server

[Read More](https://notes.alelec.net/posts/claude-meets-micropython)

## Links

[ViperIDE Online](https://viper-ide.org)  
[Feedback](./docs/Feedback.md)  
[Documentation](./docs/)  
[Discussion](https://github.com/orgs/micropython/discussions/15219)  

## Used software

- [CodeMirror](https://codemirror.net) - Main code editor, MIT
- [Ruff](https://docs.astral.sh/ruff) - Python linter and formatter, MIT
- [Xterm.js](https://xtermjs.org) - REPL Terminal, MIT
- [PeerJS](https://peerjs.com) - P2P/WebRTC connections, MIT
- [MicroPython/PyScript](https://www.npmjs.com/package/@micropython/micropython-webassembly-pyscript) - Virtual Machine, MIT
- [mpy-cross-wasm](https://github.com/vshymanskyy/mpy-cross-wasm) - Code validation and `.mpy` compilation, MIT
- [mpy-tool](https://github.com/micropython/micropython/blob/master/tools/mpy-tool.py) - MPY bytecode disassembler - MIT
- [python-minifier](https://github.com/dflook/python-minifier) - Code minifier, MIT
