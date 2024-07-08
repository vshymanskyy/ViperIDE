#!/usr/bin/env python3

import time
import json, glob
from os import remove as rm, system, path, makedirs
from shutil import copyfile as cp, copytree, rmtree

def run(cmd):
    if system(cmd) != 0:
        raise Exception(f"Command failed: {cmd}")

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

def gen_manifest(src, dst):
    pkg = json.loads(readfile('package.json'))
    result = json.loads(readfile(src))
    result['version'] = pkg['version']
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(result, f, separators=(',',':'), ensure_ascii=False)

def combine(dst):
    # Insert CSS and JS into HTML
    combined = readfile(dst).replace(
        '<link rel="stylesheet" href="./app.css">', '<style>\n' + readfile('build/app.css') + '\n</style>'
    ).replace(
        '<link rel="stylesheet" href="./viper_lib.css">', '<style>\n' + readfile('build/viper_lib.css') + '\n</style>'
    ).replace(
        '<script src="./app.js"></script>', '<script>\n' + readfile('build/app.js') + '\n</script>'
    ).replace(
        '<script src="./viper_lib.js"></script>', '<script>\n' + readfile('build/viper_lib.js') + '\n</script>'
    )

    # Write the combined content
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(combined)

if __name__ == "__main__":
    # Prepare
    rmtree("build", ignore_errors=True)
    makedirs("build")
    gen_translations("./lang/", "build/translations.json")
    gen_manifest("./src/manifest.json", "build/manifest.json")

    # Build
    if not path.isdir("node_modules"):
        run("npm install")
    run("npx eslint")
    run("npm run build")

    # Combine everything
    combine("build/index.html")
    combine("build/bridge.html")
    combine("build/benchmark.html")

    # Cleanup
    #run("rm build/translations.json")
    run("rm build/app.css   build/viper_lib.css")
    run("rm build/app.js    build/viper_lib.js")

    # Add assets, manifest, etc
    copytree("./assets", "./build/assets")
    cp("node_modules/@pybricks/mpy-cross-v6/build/mpy-cross-v6.wasm", "./build/assets/mpy-cross-v6.wasm")
    cp("./src/webrepl_content.js", "./build/webrepl_content.js")

    print()
    print("Build complete.")
