#!/usr/bin/env python3

import time
import json, glob
from os import remove as rm, system, path, makedirs
from shutil import copyfile as cp, copytree, rmtree

def readfile(fn):
    with open(fn, 'r', encoding='utf-8') as f:
        return f.read()

def gen_translations(src, dst):
    result = {}
    for fn in glob.glob('*.json', root_dir=src):
        lang = fn.replace('.json', '')
        result[lang] = json.loads(readfile(src + fn))
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(result, f, separators=(',',':'), ensure_ascii=False, sort_keys=True)

def combine(src, dst):
    # Insert CSS and JS into HTML
    combined = readfile(src).replace(
        '<link rel="stylesheet" href="./common.css">', '<style>\n' + readfile('src/app_common.css') + '\n</style>'
    ).replace(
        '<link rel="stylesheet" href="./app.css">', '<style>\n' + readfile('build/app.css') + '\n</style>'
    ).replace(
        '<script src="./app.js"></script>', '<script>\n' + readfile('build/app.js') + '\n</script>'
    ).replace(
        'window.VIPER_IDE_BUILD', str(int(time.time() * 1000))
    )

    # Write the combined content
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(combined)

if __name__ == "__main__":
    rmtree("build", ignore_errors=True)
    makedirs("build")
    gen_translations("./lang/", "build/translations.json")

    if not path.isdir("node_modules"):
        system("npm install")
    system("npm run build")

    system("jq -c . < manifest.json > ./build/manifest.json")
    combine("src/ViperIDE.html",   "build/index.html")
    combine("src/bridge.html",     "build/bridge.html")
    combine("src/benchmark.html",  "build/benchmark.html")

    copytree("./assets", "./build/assets")
    cp("node_modules/@pybricks/mpy-cross-v6/build/mpy-cross-v6.wasm", "./build/assets/mpy-cross-v6.wasm")
    cp("./src/webrepl_content.js", "./build/webrepl_content.js")

    # Cleanup
    rm("build/app.css")
    rm("build/app.js")
    rm("build/translations.json")

    print()
    print("Build complete.")

