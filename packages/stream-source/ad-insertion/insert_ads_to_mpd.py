#!/usr/bin/env python3

"""
Expose http://localhost:3000/manifest, /manifest2, and /manifest3.

The endpoints:
- All three update availabilityStartTime to NOW (Live Reset).
- ALL three save their output to the SAME file: stream_with_ad.mpd.
"""

from __future__ import annotations

import http.server
import traceback
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict

import os

_STREAM_ROOT = Path(os.environ.get("STREAM_ROOT", "/app/live-streaming"))

# All manifests will write to this single file
PATCHED_MANIFEST_PATH = _STREAM_ROOT / "processed" / "output" / "stream_with_ad.mpd"
SERVER_ADDRESS = ("0.0.0.0", 3000)

# Template files directory
TEMPLATES_DIR = Path(os.environ.get("TEMPLATES_DIR", str(Path(__file__).resolve().parent.parent / "manifest-templates")))

# Load manifest templates from files
def load_template(template_name: str) -> str:
    """Load a manifest template from a file."""
    template_path = TEMPLATES_DIR / template_name
    if not template_path.exists():
        raise FileNotFoundError(f"Template file not found: {template_path}")
    return template_path.read_text(encoding="utf-8")

# Map endpoints to template files
MANIFEST_TEMPLATE_FILES = {
    "/manifest": "manifest1.mpd",
    "/manifest2": "manifest2.mpd",
    "/manifest3": "manifest3.mpd",
    "/manifest4": "manifest4.mpd",
}

# Load all templates
MANIFEST_TEMPLATES = {
    path: load_template(filename)
    for path, filename in MANIFEST_TEMPLATE_FILES.items()
}

MANIFEST_RESET_FLAGS = {path: True for path in MANIFEST_TEMPLATE_FILES}


def update_live_mpd_times(mpd_xml_template: str, dynamic_reset: bool) -> str:
    """
    Fills in the live time placeholders in the XML template and saves the result
    to PATCHED_MANIFEST_PATH unconditionally.
    """
    now_iso = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    availability_start_time = now_iso if dynamic_reset else "1970-01-01T00:00:00.000Z"

    manifest = mpd_xml_template.format(
        availabilityStartTime=availability_start_time,
        publishTime=now_iso
    )

    PATCHED_MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    PATCHED_MANIFEST_PATH.write_text(manifest, encoding="utf-8")

    return manifest


class ManifestRequestHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(200)
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.split("?")[0].rstrip("/")

        if path not in MANIFEST_TEMPLATES:
            self.send_error(404, "Not Found")
            return

        try:
            template = MANIFEST_TEMPLATES[path]
            reset_flag = MANIFEST_RESET_FLAGS[path]
            manifest = update_live_mpd_times(template, reset_flag)
        except Exception as exc:
            error_msg = f"Error generating manifest for {path}: {exc}"
            traceback.print_exc()
            print(f"[ERROR] {error_msg}")
            self.send_response(500)
            self.send_header("Content-Type", "application/mpeg+dash")
            self.end_headers()
            self.wfile.write(f"{error_msg}\n".encode("utf-8"))
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/mpeg+dash")
        self.end_headers()
        self.wfile.write(manifest.encode("utf-8"))

    def log_message(self, format: str, *args) -> None:
        # Quieter logging
        print(f"[manifest] {self.address_string()} {format % args}")


def main() -> None:
    httpd = http.server.HTTPServer(SERVER_ADDRESS, ManifestRequestHandler)

    print("Serving dynamic, ad-enabled manifests (ALL Live Reset):")
    for path in MANIFEST_TEMPLATES:
        print(f" - {path} (Live Reset) -> Saves to: {PATCHED_MANIFEST_PATH.name}")

    # Generate initial files for visibility
    try:
        print("\nGenerating initial manifests...")
        update_live_mpd_times(MANIFEST_TEMPLATES["/manifest"], MANIFEST_RESET_FLAGS["/manifest"])
        print(f"Initial manifest generated (all save to: {PATCHED_MANIFEST_PATH.name})")
    except Exception as exc:
        print(f"Warning: Could not generate initial manifests: {exc}")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down manifest server...")
        httpd.server_close()


if __name__ == "__main__":
    main()