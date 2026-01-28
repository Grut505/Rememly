# PDF Merge Setup

This guide explains how to merge PDF chunks **either locally (Python)** or **automatically (GitHub Actions)**.

---

## A) Local merge (Python)

### 1) Prerequisites

- Access to Apps Script project (Script Properties)
- Google Cloud project with **Drive API** enabled

---

### 2) Create OAuth credentials for Drive

1. Go to **Google Cloud Console → APIs & Services → Credentials**:  
   https://console.cloud.google.com/apis/credentials?project=rememly
2. **Create Credentials → OAuth client ID**.
3. Application type: **Desktop app**.
4. Give the OAuth client a name (any name is fine, e.g. `Rememly Merge`).
5. Download the file and save as `credentials.json` **next to the script** (e.g. in the repo root or in `scripts/`).

If you get **“Access blocked: app not verified”**, add your account as a test user:
- Google Cloud Console → **OAuth overview** → **Audience**:  
  https://console.cloud.google.com/auth/audience?project=rememly
- Set **User type** to **External (Testing)**
- Add your Google email in **Test users**

---

### 3) Configure folder id

From the `scripts/` folder, copy the example file and edit `merge_pdf_from_drive.ini`:

```
cp merge_pdf_from_drive.ini.example merge_pdf_from_drive.ini

[merge]
folder_id=YOUR_FOLDER_ID
credentials=credentials.json
token=token.json
save_local=false
open_local=false
apps_script_url=
merge_token=
move_to_pdf_root=false
clean_chunks=false
```

### 4) Configure Apps Script callback (optional)

If you want the local merge to **update `jobs_pdf` and send the final email**, set:

- `apps_script_url`: your Apps Script Web App URL  
  → Apps Script editor → **Deploy** → **Manage deployments** → copy the **Web app URL**  
- `merge_token`: the same value as `PDF_MERGE_TOKEN` in Apps Script Script Properties  

---

### 5) Generate token.json (one-time)

Run locally once to authorize Drive access:

```bash
cd scripts
python -m venv .venv
source .venv/bin/activate
pip install -r merge_pdf_from_drive.requirements.txt
python merge_pdf_from_drive.py
```

This opens a browser to authorize. It creates `token.json`.

---

### 6) Run local merge

```bash
python merge_pdf_from_drive.py
```

The merged PDF is uploaded to the same Drive folder.

Notes:
- Chunks are stored in `Rememly/pdf/pdf_job_<jobId>`
- Files are merged by name (e.g. `chunk_000_cover.pdf`, `chunk_001_YYYY-MM.pdf`, etc.)
- The merged file name includes a timestamp (e.g. `merged_20260128_143012.pdf`)
- Set `save_local=true` to save a local copy (optionally `open_local=true`).
- Set `move_to_pdf_root=true` to move the merged file to `Rememly/pdf`.
- Set `clean_chunks=true` to delete chunk PDFs after successful merge.

If your environment cannot open a browser directly, use:

```bash
python merge_pdf_from_drive.py --no-browser
```

This will print a local URL. Open it in a normal browser and complete the OAuth flow there.

---

## B) Automatic merge (GitHub Actions)

### 1) GitHub Secrets

In **GitHub → Settings → Secrets and variables → Actions**, add:

- `GDRIVE_CREDENTIALS_JSON`  
  base64 of `credentials.json`
- `GDRIVE_TOKEN_JSON`  
  base64 of `token.json`
- `APPS_SCRIPT_URL`  
  your Apps Script Web App URL (https://script.google.com/.../exec)
- `PDF_MERGE_TOKEN`  
  secret string used by Apps Script to validate merge completion

Encode secrets:

```bash
base64 -w 0 credentials.json
base64 -w 0 token.json
```

---

### 2) Apps Script Properties

In **Apps Script → Project Settings → Script Properties**:

- `GITHUB_TOKEN`  
  A GitHub Personal Access Token with `repo` scope
- `PDF_MERGE_TOKEN`  
  Must match the GitHub secret

Optional (defaults shown):
- `GITHUB_REPO` = `Grut505/Rememly`
- `GITHUB_PDF_MERGE_WORKFLOW` = `pdf-merge.yml`
- `GITHUB_PDF_MERGE_REF` = `main`

---

### 3) GitHub Workflow

Make sure this workflow file exists in the repo:

```
.github/workflows/pdf-merge.yml
```

This workflow:
1. Downloads chunks from Drive
2. Merges them
3. Uploads merged PDF to Drive
4. Calls Apps Script endpoint `pdf/merge-complete`

---

### 4) Apps Script endpoint

The Apps Script endpoint `pdf/merge-complete`:
- updates `jobs_pdf` (`pdf_url`, `pdf_file_id`)
- sends the final email

It is protected by `PDF_MERGE_TOKEN`.

---

### 5) Trigger behavior

When PDF chunks are ready, Apps Script automatically triggers the GitHub Action with:

- `folder_id`

No manual action required.

---

### 6) Manual trigger (optional)

GitHub → **Actions → PDF Merge → Run workflow**

Fill:
- `folder_id`

---

### 7) Verification checklist

- [ ] Workflow runs successfully
- [ ] Merged PDF appears in the job folder
- [ ] `jobs_pdf` is updated with merged PDF URL
- [ ] User receives final email
