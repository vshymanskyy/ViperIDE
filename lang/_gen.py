#!/usr/bin/env python3

import json, glob

def readfile(fn):
    with open(fn, 'r', encoding='utf-8') as f:
        return f.read()

def translations_json():
    result = {}
    for fn in glob.glob('*.json', root_dir='./lang/'):
        lang = fn.replace('.json', '')
        result[lang] = json.loads(readfile('./lang/' + fn))
    return json.dumps(result, separators=(',',':'), ensure_ascii=False, sort_keys=True)

# Write the combined content
with open('./build/translations.json', 'w', encoding='utf-8') as f:
    f.write(translations_json())
