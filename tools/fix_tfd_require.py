"""
Fix scoped tfd-logger requires: move them to module top level.
Run on VPS: python3 /root/TransForDiscord/tools/fix_tfd_require.py
"""
import os

BASE = "/root/TransForDiscord"

fixes = [
    {
        "file": "tfd-system/extractors/twitter-v2.js",
        "add_after_line": 12,
        "txt": 'const tfd = require("../../utils/tfd-logger");',
        "del_range": (35, 50),
    },
    {
        "file": "tfd-system/core/link-processor.js",
        "add_after_line": 8,
        "txt": 'const tfd = require("../../utils/tfd-logger");',
        "del_range": (140, 155),
    },
    {
        "file": "tfd-system/extractors/facebook.js",
        "add_after_line": None,
        "txt": 'const tfd = require("../../utils/tfd-logger");',
        "del_range": (1130, 1150),
    },
    {
        "file": "tfd-system/index.js",
        "add_after_line": None,
        "txt": 'const tfd = require("../utils/tfd-logger");',
        "del_range": (50, 65),
    },
    {
        "file": "tfd-system/extractors/index.js",
        "add_after_line": None,
        "txt": 'const tfd = require("../../utils/tfd-logger");',
        "del_range": (225, 240),
    },
    {
        "file": "tfd-system/extractors/dynamic.js",
        "add_after_line": None,
        "txt": 'const tfd = require("../../utils/tfd-logger");',
        "del_range": (60, 80),
    },
    {
        "file": "utils/playwright-semantic-browser.js",
        "add_after_line": None,
        "txt": 'const tfd = require("./tfd-logger");',
        "del_range": (295, 310),
    },
]

for fix in fixes:
    path = os.path.join(BASE, fix["file"])
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Find insertion point
    add_after = fix["add_after_line"]
    if add_after is None:
        for i, line in enumerate(lines[:40], 1):
            if "require(" in line and not line.strip().startswith("//"):
                add_after = i

    # Delete scoped require
    lo, hi = fix["del_range"]
    new_lines = []
    deleted = False
    for i, line in enumerate(lines, 1):
        if lo <= i <= hi and "const tfd = require" in line and not deleted:
            deleted = True
            print(f"  DEL  L{i}: {line.rstrip()}")
            continue
        new_lines.append(line)

    # Insert at top
    new_lines.insert(add_after, fix["txt"] + "\n")
    print(f"  ADD  L{add_after + 1}: {fix['txt']}")

    with open(path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)

    bn = os.path.basename(fix["file"])
    print(f"  => {bn} OK\n")

print("All 7 files fixed!")
