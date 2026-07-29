"""
Renders just the PDF cover page for the Settings "Preview PDF" button.

Reuses generate_cover_html()/generate_blurb_cover_html()/render_html_to_pdf()
from render_pdf_chunks.py so the preview matches the real book pixel-for-
pixel, with an empty article list (no real photos fetched) - this naturally
produces the plain/solid-colour cover fallback rather than the photo mosaic,
which is what a quick settings preview needs.

When options.blurb_mode_enabled is set, renders the Blurb print-ready cover
wrap (front + spine + back) instead of the plain digital cover, at the
selected format/cover type/paper type - the same code path used for the real
export's cover-wrap file. Settings has no per-export page count to draw on
(that's only known once real interior content is generated), so a nominal
placeholder page count is used purely to produce a representative spine
width for this quick preview; the real export recomputes it from the actual
generated page count.
"""

import argparse
import base64
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, __file__.rsplit('/', 1)[0])

import blurb_print_spec  # noqa: E402
from render_pdf_chunks import (  # noqa: E402
    API_HEADERS, generate_blurb_cover_html, generate_cover_html, render_html_to_pdf,
)
from playwright.sync_api import sync_playwright  # noqa: E402

BLURB_PREVIEW_PAGE_COUNT = blurb_print_spec.PAGE_COUNT_MIN


def api_call(callback_url: str, path: str, params: dict, method: str = "GET"):
    qs = urllib.parse.urlencode({"path": path, **params})
    url = f"{callback_url}?{qs}"
    req = urllib.request.Request(url, method=method, headers=API_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"{path} failed: HTTP {exc.code} {body}")
    if not payload.get("ok"):
        raise SystemExit(f"{path} failed: {payload}")
    return payload.get("data", {})


def fetch_preview_job(callback_url: str, token: str, preview_id: str):
    data = api_call(callback_url, "pdf/preview-job", {"token": token, "preview_id": preview_id})
    return data.get("options", {}), data.get("config", {})


def report_complete(callback_url: str, token: str, preview_id: str, pdf_bytes: bytes):
    b64 = base64.b64encode(pdf_bytes).decode("ascii")
    qs = urllib.parse.urlencode({"path": "pdf/preview-complete", "token": token})
    url = f"{callback_url}?{qs}"
    body = json.dumps({"preview_id": preview_id, "base64": b64}).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method="POST", headers={**API_HEADERS, "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if not payload.get("ok"):
        raise SystemExit(f"pdf/preview-complete failed: {payload}")


def main():
    parser = argparse.ArgumentParser(description="Render a single PDF cover preview and report it back.")
    parser.add_argument("--preview-id", required=True)
    parser.add_argument("--callback-url", required=True)
    parser.add_argument("--callback-token", required=True)
    args = parser.parse_args()

    options, config = fetch_preview_job(args.callback_url, args.callback_token, args.preview_id)

    if options.get('blurb_mode_enabled'):
        cover_html = generate_blurb_cover_html(
            [], "", "", options, config, args.callback_url, args.callback_token,
            format_key=options.get('blurb_format') or 'magazine_premium',
            cover_type=options.get('blurb_cover_type') or 'softcover',
            paper_type=options.get('blurb_paper_type') or '100# Text, Gloss',
            page_count=BLURB_PREVIEW_PAGE_COUNT,
            show_spine_guide=True,
        )
    else:
        cover_html = generate_cover_html([], "", "", options, config, args.callback_url, args.callback_token)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        pdf_bytes = render_html_to_pdf(browser, cover_html)
        browser.close()

    report_complete(args.callback_url, args.callback_token, args.preview_id, pdf_bytes)
    print(json.dumps({"preview_id": args.preview_id, "bytes": len(pdf_bytes)}))


if __name__ == "__main__":
    main()
