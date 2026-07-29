#!/usr/bin/env python3
import argparse
import configparser
import io
import json
import os
from datetime import datetime
import urllib.request
from typing import List, Optional

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload
import pikepdf

SCOPES = ["https://www.googleapis.com/auth/drive"]


def get_drive_service(credentials_path: str, token_path: str, use_console: bool):
    creds = None
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except Exception as exc:
            creds = None
    if not creds or not creds.valid:
        if use_console and os.getenv("GITHUB_ACTIONS") == "true":
            raise SystemExit("No valid token.json found in CI. Re-auth locally to refresh token.json.")
        flow = InstalledAppFlow.from_client_secrets_file(credentials_path, SCOPES)
        if use_console:
            # Print URL, user opens it manually; local server receives the redirect.
            creds = flow.run_local_server(port=0, open_browser=False)
        else:
            creds = flow.run_local_server(port=0)
        with open(token_path, "w", encoding="utf-8") as f:
            f.write(creds.to_json())
    return build("drive", "v3", credentials=creds)


# Uploaded as its own file by render_pdf_chunks.py when Blurb mode is on -
# a complete standalone PDF, not one of the interior chunks. It must be
# excluded from the merge and delivered separately (see move_cover_wrap_if_present).
COVER_WRAP_FILENAME = "cover_wrap.pdf"


def list_pdf_files(service, folder_id: str) -> List[dict]:
    q = (
        f"'{folder_id}' in parents and mimeType='application/pdf' and trashed=false "
        f"and name != '{COVER_WRAP_FILENAME}'"
    )
    results = service.files().list(q=q, fields="files(id,name,size,createdTime)").execute()
    files = results.get("files", [])

    def sort_key(f):
        name = f.get("name", "")
        created = f.get("createdTime", "")
        num = 10**9
        if name.startswith("chunk_"):
            try:
                num = int(name.split("_")[1])
            except Exception:
                num = 10**9
        return (num, name, created, f.get("id", ""))

    files.sort(key=sort_key)
    return files


def ensure_folder_exists(service, folder_id: str):
    try:
        folder = service.files().get(fileId=folder_id, fields="id,mimeType,trashed").execute()
    except Exception as exc:
        raise SystemExit(f"Folder not found or inaccessible: {folder_id}") from exc
    if folder.get("trashed"):
        raise SystemExit(f"Folder is trashed: {folder_id}")
    if folder.get("mimeType") != "application/vnd.google-apps.folder":
        raise SystemExit(f"Not a folder: {folder_id}")


def download_file(service, file_id: str) -> bytes:
    request = service.files().get_media(fileId=file_id)
    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return fh.getvalue()


def upload_file(service, folder_id: str, name: str, data: bytes):
    media = MediaIoBaseUpload(io.BytesIO(data), mimetype="application/pdf", resumable=True)
    file_metadata = {"name": name, "parents": [folder_id]}
    created = service.files().create(body=file_metadata, media_body=media, fields="id,webViewLink,parents").execute()
    return created


def find_child_folder(service, parent_id: str, name: str) -> Optional[str]:
    q = f"'{parent_id}' in parents and mimeType='application/vnd.google-apps.folder' and name='{name}' and trashed=false"
    results = service.files().list(q=q, fields="files(id,name)").execute()
    files = results.get("files", [])
    if not files:
        return None
    return files[0]["id"]


def get_pdf_root_folder_id(service) -> Optional[str]:
    q = "name='Rememly' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    results = service.files().list(q=q, fields="files(id,name)").execute()
    roots = results.get("files", [])
    if not roots:
        return None
    rememly_id = roots[0]["id"]
    return find_child_folder(service, rememly_id, "pdf")


def move_file_to_folder(service, file_id: str, new_parent_id: str):
    file = service.files().get(fileId=file_id, fields="parents").execute()
    previous_parents = ",".join(file.get("parents", []))
    service.files().update(
        fileId=file_id,
        addParents=new_parent_id,
        removeParents=previous_parents,
        fields="id, parents",
    ).execute()


def find_file_by_name(service, folder_id: str, name: str) -> Optional[dict]:
    q = f"'{folder_id}' in parents and name='{name}' and trashed=false"
    results = service.files().list(q=q, fields="files(id,name)").execute()
    files = results.get("files", [])
    return files[0] if files else None


def move_cover_wrap_if_present(service, folder_id: str, destination_folder_id: str, new_name: str) -> Optional[dict]:
    """If render_pdf_chunks.py uploaded a Blurb cover-wrap PDF alongside the
    interior chunks, move it (not merge it) into the same destination as the
    merged album PDF, renamed distinctly. No-op if Blurb mode wasn't on for
    this job."""
    cover_wrap = find_file_by_name(service, folder_id, COVER_WRAP_FILENAME)
    if not cover_wrap:
        return None
    service.files().update(fileId=cover_wrap["id"], body={"name": new_name}).execute()
    move_file_to_folder(service, cover_wrap["id"], destination_folder_id)
    return cover_wrap


def delete_chunks(service, folder_id: str, keep_file_id: str):
    files = list_pdf_files(service, folder_id)
    for f in files:
        if f["id"] == keep_file_id:
            continue
        service.files().delete(fileId=f["id"]).execute()


def get_file_web_view_link(service, file_id: str) -> Optional[str]:
    file = service.files().get(fileId=file_id, fields="webViewLink").execute()
    return file.get("webViewLink")


def create_folder(service, name: str, parent_id: str) -> dict:
    metadata = {"name": name, "mimeType": "application/vnd.google-apps.folder", "parents": [parent_id]}
    return service.files().create(body=metadata, fields="id,webViewLink").execute()


def call_merge_complete(
    apps_script_url: str,
    token: str,
    folder_id: str,
    file_id: str,
    url: str,
    clean_chunks: bool,
):
    payload = json.dumps({
        "token": token,
        "folder_id": folder_id,
        "file_id": file_id,
        "url": url,
        "clean_chunks": clean_chunks,
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{apps_script_url}?path=pdf/merge-complete",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        resp.read()


def main():
    parser = argparse.ArgumentParser(description="Merge PDFs from a Drive folder and upload result back.")
    parser.add_argument("--config", default="merge_pdf_from_drive.ini", help="Config ini path")
    parser.add_argument("--folder-id", help="Drive folder id containing PDF chunks")
    parser.add_argument("--credentials", help="OAuth client secrets json")
    parser.add_argument("--token", help="Token cache json")
    parser.add_argument("--no-browser", action="store_true", help="Use console OAuth flow (no local browser)")
    parser.add_argument("--auth-only", action="store_true", help="Only (re)authenticate and write token.json, then exit")
    parser.add_argument("--clean-chunks", action="store_true", help="Delete chunk PDFs after successful merge")
    parser.add_argument("--move-to-pdf-root", action="store_true", help="Move the merged PDF (and Blurb cover-wrap, if any) into Rememly/pdf")
    parser.add_argument("--delete-chunks-folder", action="store_true", help="Delete the per-job chunks folder after cleaning it")
    parser.add_argument("--skip-callback", action="store_true", help="Do not call Apps Script merge-complete callback")
    args = parser.parse_args()

    config = configparser.ConfigParser()
    if os.path.exists(args.config):
        config.read(args.config)
    cfg = config["merge"] if "merge" in config else {}

    folder_id = args.folder_id or cfg.get("folder_id")
    credentials = args.credentials or cfg.get("credentials", "credentials.json")
    token = args.token or cfg.get("token", "token.json")
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_name = f"merged_{ts}.pdf"
    save_local = (cfg.get("save_local", "false").lower() == "true")
    local_output_path = os.path.join(os.getcwd(), output_name)
    open_local = (cfg.get("open_local", "false").lower() == "true")
    apps_script_url = cfg.get("apps_script_url", "").strip()
    merge_token = cfg.get("merge_token", "").strip()
    # CLI flags OR'd with the (gitignored, local-only) ini file - the real
    # GitHub Actions runner has no ini file at all (it's not committed), so
    # these must be reachable via CLI flags too, not silently default to
    # off in CI. This was a real, previously-unnoticed production bug: the
    # merged PDF (and any Blurb cover-wrap) never actually moved out of the
    # temporary per-job chunks folder, for every job, not just Blurb ones.
    delete_chunks_folder = args.delete_chunks_folder or (cfg.get("delete_chunks_folder", "false").lower() == "true")
    move_to_pdf_root = args.move_to_pdf_root or (cfg.get("move_to_pdf_root", "false").lower() == "true")
    clean_chunks = args.clean_chunks or (cfg.get("clean_chunks", "false").lower() == "true")

    service = get_drive_service(credentials, token, args.no_browser)
    if args.auth_only:
        print(f"OAuth OK. Token saved to: {os.path.abspath(token)}")
        return

    if not folder_id:
        raise SystemExit("Missing folder_id. Set it in config or pass --folder-id.")

    ensure_folder_exists(service, folder_id)
    print("Listing PDFs in folder...")
    files = list_pdf_files(service, folder_id)
    if not files:
        raise SystemExit("No PDF files found in folder.")
    print(f"Found {len(files)} PDF file(s).")

    pdf = pikepdf.Pdf.new()
    total = len(files)
    for idx, f in enumerate(files, start=1):
        name = f.get("name", "unknown")
        size = f.get("size", "unknown")
        print(f"[{idx}/{total}] Downloading {name} ({size} bytes)...")
        data = download_file(service, f["id"])
        print(f"[{idx}/{total}] Merging {name}...")
        with pikepdf.Pdf.open(io.BytesIO(data)) as src:
            pdf.pages.extend(src.pages)
        if idx % 5 == 0 or idx == total:
            print(f"[{idx}/{total}] Progress: merged {idx} file(s).")

    print("Saving merged PDF...")
    out_bytes = io.BytesIO()
    pdf.save(out_bytes)
    out_bytes.seek(0)

    if save_local:
        with open(local_output_path, "wb") as f:
            f.write(out_bytes.getvalue())
        print(f"Saved locally: {os.path.abspath(local_output_path)}")
        if open_local:
            local_url = "file://" + os.path.abspath(local_output_path)
            print(f"Local file URL: {local_url}")

    print("Uploading merged PDF to Drive...")
    created = upload_file(service, folder_id, output_name, out_bytes.getvalue())
    result = {"file_id": created.get("id"), "url": created.get("webViewLink")}

    # When Blurb mode produced a separate cover-wrap file, the content PDF and
    # the cover are two distinct deliverables - the link handed back to the
    # family must point at a dedicated folder containing both, not at either
    # file alone (and not at the shared Rememly/pdf root, which also holds
    # every other job's output).
    callback_url = created.get("webViewLink", "")

    if move_to_pdf_root:
        pdf_root_id = get_pdf_root_folder_id(service)
        if pdf_root_id:
            cover_wrap_present = find_file_by_name(service, folder_id, COVER_WRAP_FILENAME) is not None
            if cover_wrap_present:
                print("Blurb mode: creating a dedicated delivery folder for the content + cover pair ...")
                delivery_folder = create_folder(service, f"Blurb_{ts}", pdf_root_id)
                delivery_folder_id = delivery_folder["id"]
                move_file_to_folder(service, created["id"], delivery_folder_id)

                cover_wrap_name = f"cover_blurb_{ts}.pdf"
                moved_cover_wrap = move_cover_wrap_if_present(service, folder_id, delivery_folder_id, cover_wrap_name)
                if moved_cover_wrap:
                    print(f"Moved content PDF and cover-wrap PDF ({cover_wrap_name}) into {delivery_folder['id']}")
                    result["cover_wrap_file_id"] = moved_cover_wrap["id"]
                    result["delivery_folder_id"] = delivery_folder_id

                folder_link = delivery_folder.get("webViewLink") or get_file_web_view_link(service, delivery_folder_id)
                if folder_link:
                    callback_url = folder_link
                    result["url"] = folder_link
            else:
                print("Moving merged PDF to Rememly/pdf ...")
                move_file_to_folder(service, created["id"], pdf_root_id)

    if clean_chunks:
        print("Cleaning chunk PDFs in folder...")
        delete_chunks(service, folder_id, created["id"])

    if (not args.skip_callback) and apps_script_url and merge_token:
        print("Updating jobs_pdf via Apps Script...")
        call_merge_complete(
            apps_script_url,
            merge_token,
            folder_id,
            created["id"],
            callback_url,
            clean_chunks,
        )

    if clean_chunks and delete_chunks_folder:
        print("Deleting chunks folder...")
        service.files().delete(fileId=folder_id).execute()

    # Keep the machine-readable result as the final stdout line for CI consumers.
    print(json.dumps(result))


if __name__ == "__main__":
    main()
