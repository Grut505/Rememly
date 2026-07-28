#!/usr/bin/env python3
"""Render a PDF job's articles into chunk PDFs (cover + one per month) and
upload them to a Drive folder, for the pdf-render.yml GitHub Action.

This mirrors the Drive OAuth pattern used by merge_pdf_from_drive.py, and is
a first-pass "Phase A" layout (simple grid, no mosaic/cover-style options
yet) so PDF export works end-to-end again after the Cloudflare migration.
"""
import argparse
import html
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime
from typing import Optional

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

SCOPES = ["https://www.googleapis.com/auth/drive"]

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def get_drive_service(credentials_path: str, token_path: str, use_console: bool):
    creds = None
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception:
            creds = None
    if not creds or not creds.valid:
        if use_console and os.getenv("GITHUB_ACTIONS") == "true":
            raise SystemExit("No valid token.json found in CI. Re-auth locally to refresh token.json.")
        flow = InstalledAppFlow.from_client_secrets_file(credentials_path, SCOPES)
        creds = flow.run_local_server(port=0, open_browser=not use_console)
        with open(token_path, "w", encoding="utf-8") as f:
            f.write(creds.to_json())
    return build("drive", "v3", credentials=creds)


def api_call(callback_url: str, path: str, params: dict, method: str = "GET"):
    qs = urllib.parse.urlencode({"path": path, **params})
    url = f"{callback_url}?{qs}"
    req = urllib.request.Request(url, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"{path} failed: HTTP {exc.code} {body}")
    if not payload.get("ok"):
        raise SystemExit(f"{path} failed: {payload}")
    return payload.get("data", {})


def fetch_job(callback_url: str, token: str, job_id: str):
    data = api_call(callback_url, "pdf/render-job", {"token": token, "job_id": job_id})
    return data["job"], data.get("articles", [])


def report_status(callback_url: str, token: str, job_id: str, progress: int, message: str):
    api_call(callback_url, "pdf/render-status", {
        "token": token, "job_id": job_id, "progress": str(progress), "message": message,
    })


def report_complete(callback_url: str, token: str, job_id: str, folder_id: str, folder_url: str):
    api_call(callback_url, "pdf/render-complete", {
        "token": token, "job_id": job_id, "folder_id": folder_id, "folder_url": folder_url,
    })


def report_failed(callback_url: str, token: str, job_id: str, message: str):
    api_call(callback_url, "pdf/render-failed", {
        "token": token, "job_id": job_id, "message": message[:1500],
    })


def find_or_create_folder(service, name: str, parent_id: Optional[str]) -> str:
    parent_clause = f"'{parent_id}' in parents and " if parent_id else ""
    q = f"{parent_clause}name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    results = service.files().list(q=q, fields="files(id,name)").execute()
    files = results.get("files", [])
    if files:
        return files[0]["id"]
    metadata = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
    if parent_id:
        metadata["parents"] = [parent_id]
    folder = service.files().create(body=metadata, fields="id").execute()
    return folder["id"]


def create_job_chunks_folder(service, job_id: str):
    rememly_id = find_or_create_folder(service, "Rememly", None)
    pdf_id = find_or_create_folder(service, "pdf", rememly_id)
    metadata = {
        "name": f"chunks_{job_id[:8]}",
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [pdf_id],
    }
    folder = service.files().create(body=metadata, fields="id,webViewLink").execute()
    return folder["id"], folder.get("webViewLink", "")


def upload_pdf(service, folder_id: str, name: str, data: bytes):
    media = MediaIoBaseUpload(io.BytesIO(data), mimetype="application/pdf", resumable=True)
    metadata = {"name": name, "parents": [folder_id]}
    created = service.files().create(body=metadata, media_body=media, fields="id").execute()
    return created["id"]


PDF_CSS = """
  @page { size: A4; margin: 1.5cm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #2a2a2a; margin: 0; }
  .cover { display: flex; flex-direction: column; align-items: center; justify-content: center;
           height: 24cm; text-align: center; }
  .cover h1 { font-size: 36pt; margin-bottom: 0.3cm; }
  .cover .family { font-size: 18pt; color: #666; margin-bottom: 1cm; }
  .cover .range { font-size: 14pt; color: #888; }
  .month-title { font-size: 22pt; border-bottom: 2px solid #ccc; padding-bottom: 0.2cm; margin-bottom: 0.6cm; }
  .article { display: flex; gap: 0.6cm; margin-bottom: 0.8cm; break-inside: avoid; }
  .article img { width: 6cm; height: 6cm; object-fit: cover; border-radius: 4px; flex-shrink: 0; }
  .article .meta { font-size: 10pt; color: #888; margin-bottom: 0.15cm; }
  .article .text { font-size: 12pt; line-height: 1.4; }
"""


def esc(value) -> str:
    return html.escape(str(value or ""))


def image_src(article: dict, callback_url: str, callback_token: str) -> str:
    file_id = article.get("image_file_id")
    if not file_id:
        return article.get("image_url") or ""
    if "/" in file_id:
        # R2-backed image (uploaded through the Worker) - proxy through our
        # token-authed endpoint since the R2 bucket has no public URL.
        qs = urllib.parse.urlencode({"path": "pdf/render-image", "token": callback_token, "file_id": file_id})
        return f"{callback_url}?{qs}"
    # Legacy Google Drive file id (imported before the R2 migration) - public thumbnail.
    return f"https://drive.google.com/thumbnail?id={file_id}&sz=w1200"


def format_date(date_str: str) -> str:
    try:
        return datetime.strptime(date_str[:10], "%Y-%m-%d").strftime("%d %B %Y")
    except Exception:
        return date_str or ""


def build_cover_html(job: dict, article_count: int) -> str:
    family = job.get("created_by_pseudo") or job.get("created_by") or ""
    date_from = format_date(job.get("date_from", ""))
    date_to = format_date(job.get("date_to", ""))
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{PDF_CSS}</style></head>
<body><div class="cover">
  <h1>Rememly</h1>
  <div class="family">{esc(family)}</div>
  <div class="range">{esc(date_from)} &mdash; {esc(date_to)}</div>
  <div class="range">{article_count} memor{'y' if article_count == 1 else 'ies'}</div>
</div></body></html>"""


def build_month_html(month_label: str, articles: list, callback_url: str, callback_token: str) -> str:
    rows = []
    for article in articles:
        src = image_src(article, callback_url, callback_token)
        img_tag = f'<img src="{esc(src)}">' if src else ""
        rows.append(f"""<div class="article">
  {img_tag}
  <div>
    <div class="meta">{esc(format_date(article.get('date', '')))} &mdash; {esc(article.get('author_pseudo') or article.get('auteur') or '')}</div>
    <div class="text">{esc(article.get('texte', ''))}</div>
  </div>
</div>""")
    body = "\n".join(rows) if rows else '<p style="color:#999">No articles this month.</p>'
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{PDF_CSS}</style></head>
<body>
  <div class="month-title">{esc(month_label)}</div>
  {body}
</body></html>"""


def render_html_to_pdf(browser, html_content: str) -> bytes:
    page = browser.new_page()
    try:
        page.set_content(html_content, wait_until="networkidle", timeout=60000)
        return page.pdf(format="A4", print_background=True)
    finally:
        page.close()


def month_label(month_key: str) -> str:
    try:
        year, month = month_key.split("-")
        return f"{MONTH_NAMES[int(month) - 1]} {year}"
    except Exception:
        return month_key


def main():
    parser = argparse.ArgumentParser(description="Render PDF job chunks and upload to Drive.")
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--credentials", default="credentials.json")
    parser.add_argument("--token", default="token.json")
    parser.add_argument("--no-browser", action="store_true", help="Use console OAuth flow (no local browser)")
    parser.add_argument("--callback-url", required=True)
    parser.add_argument("--callback-token", required=True)
    args = parser.parse_args()

    job, articles = fetch_job(args.callback_url, args.callback_token, args.job_id)

    try:
        by_month = defaultdict(list)
        for article in articles:
            key = (article.get("date") or "")[:7] or "unknown"
            by_month[key].append(article)
        months = sorted(by_month.keys())
        total_chunks = 1 + len(months)

        service = get_drive_service(args.credentials, args.token, args.no_browser)
        folder_id, folder_url = create_job_chunks_folder(service, args.job_id)
        report_status(args.callback_url, args.callback_token, args.job_id, 8,
                       f"Rendering {total_chunks} chunk(s) for {len(articles)} article(s)")

        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch()

            cover_pdf = render_html_to_pdf(browser, build_cover_html(job, len(articles)))
            upload_pdf(service, folder_id, "chunk_000_cover.pdf", cover_pdf)
            report_status(args.callback_url, args.callback_token, args.job_id,
                          10, f"Rendered cover (1/{total_chunks})")

            for idx, key in enumerate(months, start=1):
                chunk_pdf = render_html_to_pdf(
                    browser,
                    build_month_html(month_label(key), by_month[key], args.callback_url, args.callback_token),
                )
                upload_pdf(service, folder_id, f"chunk_{idx:03d}_{key}.pdf", chunk_pdf)
                progress = 10 + int(80 * idx / max(len(months), 1))
                report_status(args.callback_url, args.callback_token, args.job_id,
                              progress, f"Rendered {month_label(key)} ({idx + 1}/{total_chunks})")

            browser.close()

        report_complete(args.callback_url, args.callback_token, args.job_id, folder_id, folder_url)
        print(json.dumps({"chunks_folder_id": folder_id, "chunks_folder_url": folder_url}))
    except SystemExit as exc:
        report_failed(args.callback_url, args.callback_token, args.job_id, str(exc))
        raise
    except Exception as exc:  # noqa: BLE001 - report any failure back to the Worker
        report_failed(args.callback_url, args.callback_token, args.job_id, str(exc))
        raise


if __name__ == "__main__":
    main()
