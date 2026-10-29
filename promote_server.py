#!/usr/bin/env python3
"""Local promote button for the NLE preview. Listens only on this machine."""

import json
import os
import shutil
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 8766
ALLOWED = {
    "https://bjornkelsen-cmd.github.io",
    "http://127.0.0.1:8766",
    "http://localhost:8766",
}
GIT_ENV = {
    "GIT_AUTHOR_NAME": "bjornkelsen-cmd",
    "GIT_AUTHOR_EMAIL": "bjornkelsen@gmail.com",
    "GIT_COMMITTER_NAME": "bjornkelsen-cmd",
    "GIT_COMMITTER_EMAIL": "bjornkelsen@gmail.com",
}


def promote():
    src = ROOT / "data-preview.json"
    dst = ROOT / "data.json"
    data = json.loads(src.read_text(encoding="utf-8"))
    if not isinstance(data.get("arbejde"), list) or not data["arbejde"]:
        raise RuntimeError("preview")
    shutil.copyfile(src, dst)
    subprocess.run(["git", "add", "--", "data.json"], cwd=ROOT, check=True)
    quiet = subprocess.run(["git", "diff", "--cached", "--quiet", "--", "data.json"], cwd=ROOT)
    if quiet.returncode == 0:
        return
    env = os.environ.copy()
    env.update(GIT_ENV)
    subprocess.run(
        ["git", "commit", "-m", "Promote preview to live"],
        cwd=ROOT,
        check=True,
        env=env,
    )
    subprocess.run(["git", "push"], cwd=ROOT, check=True, env=env)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def end_headers(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Promote")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204 if self.path == "/godkend" else 404)
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length:
            self.rfile.read(min(length, 10000))
        origin = self.headers.get("Origin", "")
        if (
            self.path != "/godkend"
            or origin not in ALLOWED
            or self.headers.get("X-Promote") != "nle"
        ):
            self.respond(403, {"ok": False})
            return
        try:
            promote()
        except Exception:
            self.respond(500, {"ok": False})
            return
        self.respond(200, {"ok": True})

    def do_GET(self):
        name = self.path.split("?", 1)[0]
        if name in ("", "/"):
            name = "/index.html"
        path = (ROOT / name.lstrip("/")).resolve()
        if not str(path).startswith(str(ROOT)) or not path.is_file() or path.suffix not in {".html", ".json"}:
            self.send_response(404)
            self.end_headers()
            return
        body = path.read_bytes()
        kind = "application/json" if path.suffix == ".json" else "text/html; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def respond(self, code, obj):
        raw = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


if __name__ == "__main__":
    raise SystemExit("Stoppet. Godkend kører i Gmail via apps-script/Kode.gs, ikke på localhost.")
