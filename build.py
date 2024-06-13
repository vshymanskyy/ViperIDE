#!/usr/bin/env python3

import os, sys, json, glob

html_path = 'ViperIDE.html'
css_path = 'app.css'
js_path = 'app.js'

with open(html_path, 'r', encoding='utf-8') as f:
    html_content = f.read()

with open(css_path, 'r', encoding='utf-8') as f:
    css_content = f.read()

with open(js_path, 'r', encoding='utf-8') as f:
    js_content = f.read()

lang_content = {}
for fn in glob.glob("*.json", root_dir="./lang/"):
    with open("./lang/" + fn) as f:
        k = fn.replace(".json", "")
        v = json.load(f)
        lang_content[k] = v
lang_content = json.dumps(lang_content, separators=(',',':'), ensure_ascii=False, sort_keys=True)

# Insert CSS and JS into HTML
combined = html_content.replace(
    '<link rel="stylesheet" href="app.css">', f'<style>{css_content}</style>'
).replace(
    '<script src="app.js"></script>', f'<script>{js_content}</script>'
).replace(
    'require("translations.json")', lang_content
)

# Write the combined content
with open(sys.argv[1], 'w', encoding='utf-8') as f:
    f.write(combined)

print('Files combined successfully!')
