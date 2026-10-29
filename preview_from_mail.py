#!/usr/bin/env python3
"""Put one Arbejde block into the preview and wait until Pages serves it."""

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PREVIEW = ROOT / "data-preview.json"
PAGES = "https://bjornkelsen-cmd.github.io/nle-us-test/data-preview.json"
GIT_ENV = {
    "GIT_AUTHOR_NAME": "bjornkelsen-cmd",
    "GIT_AUTHOR_EMAIL": "bjornkelsen@gmail.com",
    "GIT_COMMITTER_NAME": "bjornkelsen-cmd",
    "GIT_COMMITTER_EMAIL": "bjornkelsen@gmail.com",
}


def load_job(path):
    job = json.loads(Path(path).read_text(encoding="utf-8"))
    nr = str(job.get("nr", "")).strip()
    titel = str(job.get("titel", "")).strip()
    tekst = str(job.get("tekst", "")).strip()
    if len(nr) != 2 or not nr.isdigit() or not titel or not tekst:
        raise SystemExit("bad job")
    return nr, titel, tekst


def upsert(nr, titel, tekst):
    data = json.loads(PREVIEW.read_text(encoding="utf-8"))
    blocks = data.setdefault("arbejde", [])
    found = False
    for block in blocks:
        if block.get("nr") == nr:
            block["titel"] = titel
            block["tekst"] = tekst
            found = True
            break
    if not found:
        blocks.append({"nr": nr, "titel": titel, "tekst": tekst})
    PREVIEW.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def pages_has(titel):
    url = PAGES + "?t=" + str(time.time())
    try:
        with urllib.request.urlopen(url, timeout=20) as res:
            body = res.read().decode("utf-8", "replace")
    except Exception:
        return False
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return False
    return any(block.get("titel") == titel for block in data.get("arbejde", []))


def publish():
    env = os.environ.copy()
    env.update(GIT_ENV)
    subprocess.run(["git", "add", "--", "data-preview.json"], cwd=ROOT, check=True)
    quiet = subprocess.run(["git", "diff", "--cached", "--quiet", "--", "data-preview.json"], cwd=ROOT)
    if quiet.returncode != 0:
        subprocess.run(
            ["git", "commit", "-m", "Update preview from NLE ARBEJDE mail"],
            cwd=ROOT,
            check=True,
            env=env,
        )
        subprocess.run(["git", "push"], cwd=ROOT, check=True, env=env)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("job")
    parser.add_argument("--wait", type=int, default=180)
    args = parser.parse_args()
    nr, titel, tekst = load_job(args.job)
    upsert(nr, titel, tekst)
    publish()
    deadline = time.time() + args.wait
    while time.time() < deadline:
        if pages_has(titel):
            print("READY")
            return
        time.sleep(5)
    print("NOT_READY")
    raise SystemExit(1)


if __name__ == "__main__":
    main()
