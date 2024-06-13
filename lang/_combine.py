#!/usr/bin/env python3

import os, sys, json, glob
files = glob.glob("*.json", root_dir="./lang/")

data = {}
for fn in files:
    with open("./lang/" + fn) as f:
        k = fn.replace(".json", "")
        v = json.load(f)
        data[k] = v

with open(sys.argv[1], "w") as f:
    json.dump(data, f, separators=(',',':'), ensure_ascii=False, sort_keys=True)
