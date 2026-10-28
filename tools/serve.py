#!/usr/bin/env python3
"""serve.py - run System Design Quest on this machine.

Serves the game from web/ (or --dir, such as a built dist/). With --data, the
content bundle is served as chapters.json. With --state, it also keeps the player's record in
plain files and opens the coach channel:

  state/events.jsonl    every answer, one JSON object a line (points are recomputed from it)
  state/coach.jsonl     messages from the coach, shown in the game's coach panel
  state/assigned.jsonl  challenges the coach set (already checked by the content gate)
  state/profile.json    the player's optional profile, written only by the game
  state/holds.json      hold-backs for mocks; the page sees labels only, never the hashed words

Without --state the page keeps progress in the browser instead, as it would on a
static website. Listens on 127.0.0.1 only. Standard library only.

Usage: serve.py [--port 8777] [--dir web] [--data bundle.json] [--state DIR]
"""
import argparse
import json
import os
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

WEB = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web"))
MAX_EVENT_BYTES = 20_000
LOCK = threading.Lock()


def read_jsonl(path):
    if not os.path.exists(path):
        return []
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return out


def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def write_json(path, obj):
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def make_handler(data_file, state_dir, web_dir=WEB):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=web_dir, **k)

        def log_message(self, fmt, *args):
            pass

        def send_json(self, obj, code=200):
            body = json.dumps(obj, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def end_headers(self):
            if not self.path.startswith("/api/"):
                self.send_header("Cache-Control", "no-cache")
            super().end_headers()

        def do_GET(self):
            url = urlparse(self.path)
            if url.path == "/chapters.json" and data_file:
                with open(data_file, "rb") as f:
                    body = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if url.path.startswith("/api/"):
                if not state_dir:
                    return self.send_json({"error": "no state"}, 404)
                if url.path == "/api/health":
                    return self.send_json({"ok": True, "coach": True})
                if url.path == "/api/events":
                    return self.send_json(read_jsonl(os.path.join(state_dir, "events.jsonl")))
                if url.path == "/api/coach":
                    after = int((parse_qs(url.query).get("after") or ["0"])[0])
                    msgs = read_jsonl(os.path.join(state_dir, "coach.jsonl"))
                    return self.send_json({"next": len(msgs), "messages": msgs[after:]})
                if url.path == "/api/assigned":
                    return self.send_json(read_jsonl(os.path.join(state_dir, "assigned.jsonl")))
                if url.path == "/api/profile":
                    p = read_json(os.path.join(state_dir, "profile.json"), {})
                    return self.send_json(p if isinstance(p, dict) else {})
                if url.path == "/api/holds":
                    doc = read_json(os.path.join(state_dir, "holds.json"), {})
                    holds = doc.get("holds", []) if isinstance(doc, dict) else []
                    return self.send_json([{"id": h["id"], "label": h.get("label", h["id"])}
                                           for h in holds if isinstance(h, dict) and isinstance(h.get("id"), str)])
                return self.send_json({"error": "not found"}, 404)
            return super().do_GET()

        def do_POST(self):
            url = urlparse(self.path)
            if url.path not in ("/api/events", "/api/profile") or not state_dir:
                return self.send_json({"error": "not found"}, 404)
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > MAX_EVENT_BYTES:
                return self.send_json({"error": "bad size"}, 413)
            if url.path == "/api/profile":
                try:
                    profile = json.loads(self.rfile.read(n))
                    assert isinstance(profile, dict)
                except (json.JSONDecodeError, AssertionError):
                    return self.send_json({"error": "bad profile"}, 400)
                with LOCK:
                    write_json(os.path.join(state_dir, "profile.json"), profile)
                return self.send_json({"ok": True})
            try:
                ev = json.loads(self.rfile.read(n))
                assert isinstance(ev, dict) and isinstance(ev.get("kind"), str)
            except (json.JSONDecodeError, AssertionError):
                return self.send_json({"error": "bad event"}, 400)
            with LOCK:
                with open(os.path.join(state_dir, "events.jsonl"), "a", encoding="utf-8") as f:
                    f.write(json.dumps(ev, ensure_ascii=False) + "\n")
            return self.send_json({"ok": True})

    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8777)
    ap.add_argument("--dir", default=WEB, help="the folder to serve (default: web/)")
    ap.add_argument("--data", help="the content bundle to serve as chapters.json (default: the folder's own chapters.json)")
    ap.add_argument("--state", help="folder for the record and the coach channel")
    a = ap.parse_args()
    if a.state:
        os.makedirs(a.state, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", a.port), make_handler(a.data, a.state, os.path.abspath(a.dir)))
    print(f"System Design Quest on http://127.0.0.1:{a.port}" + (" (coach on)" if a.state else ""), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
