#!/usr/bin/env python3

import os, sys, json, glob, time

def readfile(fn):
    with open(fn, 'r', encoding='utf-8') as f:
        return f.read()

def translations_json():
    result = {}
    for fn in glob.glob('*.json', root_dir='./lang/'):
        lang = fn.replace('.json', '')
        result[lang] = json.loads(readfile('./lang/' + fn))
    return json.dumps(result, separators=(',',':'), ensure_ascii=False, sort_keys=True)

# Insert CSS and JS into HTML
combined = readfile('ViperIDE.html').replace(
    '<link rel="stylesheet" href="./app.css">', '<style>' + readfile('app.css') + '</style>'
).replace(
    '<script src="./app.js"></script>', '<script>' + readfile('app.js') + '</script>'
).replace(
    '<script src="./transports.js"></script>', '<script>' + readfile('transports.js') + '</script>'
).replace(
    'require("translations.json")', translations_json()
).replace(
    'window.VIPER_IDE_BUILD', str(int(time.time() * 1000))
)

# Write the combined content
with open(sys.argv[1], 'w', encoding='utf-8') as f:
    f.write(combined)

print('Files combined successfully!')
