#!/usr/bin/env python3

import os, sys, json, glob, time

def readfile(fn):
    with open(fn, 'r', encoding='utf-8') as f:
        return f.read()

# Insert CSS and JS into HTML
combined = readfile(sys.argv[1]).replace(
    '<link rel="stylesheet" href="./common.css">', '<style>\n' + readfile('src/app_common.css') + '\n</style>'
).replace(
    '<link rel="stylesheet" href="./app.css">', '<style>\n' + readfile('build/app.css') + '\n</style>'
).replace(
    '<script src="./app.js"></script>', '<script>\n' + readfile('build/app.js') + '\n</script>'
).replace(
    'window.VIPER_IDE_BUILD', str(int(time.time() * 1000))
)

# Write the combined content
with open(sys.argv[2], 'w', encoding='utf-8') as f:
    f.write(combined)

print('Files combined successfully!')
