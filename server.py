#!/usr/bin/env python3
"""go2town local server.

Two jobs:
  1. Serve the static game in ./public
  2. Voice the narrator on demand at /api/tts using Microsoft Edge's
     natural-sounding neural voices (edge-tts).

Why a server at all? Because the narrator needs to say things that contain the
learner's own name ("Nice to meet you, Maria!"). Pre-baked audio clips can't do
that, so we synthesize on the fly and cache each unique line by hash, making
every repeat instant.

Run:
    python server.py            # http://localhost:8000
    python server.py --port 9000
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

try:
    import edge_tts
except ImportError:  # pragma: no cover - friendly message instead of a stack trace
    sys.exit(
        "edge-tts is not installed.\n"
        "Install the dependencies first:\n"
        "    pip install -r requirements.txt"
    )

ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
CACHE_DIR = ROOT / "cache" / "tts"
# Street View fixtures live outside public/ and are served under /imagery/ for
# legacy/local development only. The default runtime now uses live Google Street
# View and does not need these images.
IMAGERY_DIR = ROOT / "street-view-imagery"
GOOGLE_MAPS_KEY_FILE = Path(
    os.environ.get(
        "GOOGLE_MAPS_KEY_FILE",
        r"C:/Users/Admin/AppData/Local/hermes/secrets/google_maps_api_key.txt",
    )
)

# Voices are validated against this list before being passed to edge-tts so the
# query string can't be used to request arbitrary remote work.
ALLOWED_VOICES = {
    "en-US-AvaNeural",
    "en-US-EmmaNeural",
    "en-US-JennyNeural",
    "en-US-AriaNeural",
    "en-US-AnaNeural",
    "en-US-GuyNeural",
    "en-GB-SoniaNeural",
}
DEFAULT_VOICE = "en-US-AvaNeural"

MAX_TEXT_LEN = 600  # a single narrator line should never be longer than this


def _cache_path(text: str, voice: str, rate: str, pitch: str) -> Path:
    key = "\n".join([voice, rate, pitch, text])
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return CACHE_DIR / f"{digest}.mp3"


async def _synthesize(text: str, voice: str, rate: str, pitch: str, dest: Path) -> None:
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    tmp = dest.with_suffix(".part")
    await communicate.save(str(tmp))
    tmp.replace(dest)  # atomic-ish: never serve a half-written file


def get_tts_mp3(text: str, voice: str, rate: str, pitch: str) -> bytes:
    """Return MP3 bytes for a line, generating and caching it if needed."""
    dest = _cache_path(text, voice, rate, pitch)
    if not dest.exists():
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        asyncio.run(_synthesize(text, voice, rate, pitch, dest))
    return dest.read_bytes()


def read_google_maps_api_key() -> str:
    """Read the local Google Maps JS key without ever writing it into the repo."""
    env_key = os.environ.get("GOOGLE_MAPS_API_KEY", "").strip()
    if env_key:
        return env_key
    try:
        return GOOGLE_MAPS_KEY_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


class GameHandler(SimpleHTTPRequestHandler):
    """Serves ./public and adds the /api/tts endpoint."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    # Quieter logs: one line per request, no noisy default formatting.
    def log_message(self, fmt, *args):
        sys.stderr.write("  %s - %s\n" % (self.address_string(), fmt % args))

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/tts":
            self._handle_tts(parse_qs(parsed.query))
            return
        if parsed.path == "/api/maps-config":
            self._handle_maps_config()
            return
        if parsed.path.startswith("/imagery/"):
            self._handle_imagery(parsed.path)
            return
        super().do_GET()

    def _handle_maps_config(self):
        key = read_google_maps_api_key()
        body = json.dumps({
            "googleMapsApiKey": key,
            "hasGoogleMapsApiKey": bool(key),
            "source": "env" if os.environ.get("GOOGLE_MAPS_API_KEY", "").strip() else "key-file",
        }).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _handle_imagery(self, path: str):
        # Map /imagery/<rest> -> street-view-imagery/<rest>, guarding traversal.
        rel = path[len("/imagery/"):]
        target = (IMAGERY_DIR / rel).resolve()
        if not str(target).startswith(str(IMAGERY_DIR.resolve())) or not target.is_file():
            self._send_json_error(404, "Imagery not found.")
            return
        ctype = "image/jpeg" if target.suffix.lower() in (".jpg", ".jpeg") else "application/octet-stream"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        self.wfile.write(data)

    def _handle_tts(self, params: dict[str, list[str]]):
        text = (params.get("text", [""])[0] or "").strip()
        voice = (params.get("voice", [DEFAULT_VOICE])[0] or DEFAULT_VOICE).strip()
        rate = (params.get("rate", ["+0%"])[0] or "+0%").strip()
        pitch = (params.get("pitch", ["+0Hz"])[0] or "+0Hz").strip()

        if not text:
            self._send_json_error(400, "Missing 'text' parameter.")
            return
        if len(text) > MAX_TEXT_LEN:
            self._send_json_error(413, "Line too long.")
            return
        if voice not in ALLOWED_VOICES:
            self._send_json_error(400, f"Unknown voice: {voice}")
            return

        try:
            audio = get_tts_mp3(text, voice, rate, pitch)
        except Exception as exc:  # network hiccup, edge-tts error, etc.
            self._send_json_error(502, f"TTS generation failed: {exc}")
            return

        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(audio)))
        # The same text always produces the same audio, so let the browser cache hard.
        self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.end_headers()
        self.wfile.write(audio)

    def _send_json_error(self, code: int, message: str):
        body = json.dumps({"error": message}).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description="go2town local game server")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    args = parser.parse_args()

    if not PUBLIC_DIR.is_dir():
        sys.exit(f"Cannot find game files at {PUBLIC_DIR}")

    server = ThreadingHTTPServer((args.host, args.port), GameHandler)
    url = f"http://{args.host}:{args.port}/"
    print("=" * 48)
    print("  go2town  —  Coma-ruga")
    print(f"  Open: {url}")
    print(f"  Voices cached in: {CACHE_DIR}")
    print("  Press Ctrl+C to stop.")
    print("=" * 48)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nBye! 🐦")
        server.shutdown()


if __name__ == "__main__":
    main()
