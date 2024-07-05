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
        '<link rel="stylesheet" href="./app.css">', '<style>\n' + readfile('build/app.css') + '\n</style>'
    ).replace(
        '<link rel="stylesheet" href="./viper_lib.css">', '<style>\n' + readfile('build/viper_lib.css') + '\n</style>'
    ).replace(
        '<script src="./app.js"></script>', '<script>\n' + readfile('build/app.js') + '\n</script>'
    ).replace(
        '<script src="./viper_lib.js"></script>', '<script>\n' + readfile('build/viper_lib.js') + '\n</script>'
    ).replace(
        'window.VIPER_IDE_BUILD', str(int(time.time() * 1000))
    )

    # Write the combined content
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(combined)

if __name__ == "__main__":
    # Prepare
    rmtree("build", ignore_errors=True)
    makedirs("build")
    gen_translations("./lang/", "build/translations.json")

    # Build
    if not path.isdir("node_modules"):
        system("npm install")
    system("npm run build")

    # Combine everything
    combine("src/ViperIDE.html",   "build/index.html")
    combine("src/bridge.html",     "build/bridge.html")
    combine("src/benchmark.html",  "build/benchmark.html")

    # Cleanup
    system("rm build/*.css")
    system("rm build/*.js")
    system("rm build/*.json")

    # Add assets, manifest, etc
    copytree("./assets", "./build/assets")
    system("jq -c . < manifest.json > ./build/manifest.json")
    cp("node_modules/@pybricks/mpy-cross-v6/build/mpy-cross-v6.wasm", "./build/assets/mpy-cross-v6.wasm")
    cp("./src/webrepl_content.js", "./build/webrepl_content.js")

    print()
    print("Build complete.")
