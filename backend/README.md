# Rememly Backend - Google Apps Script

Backend pour l'application Rememly utilisant Google Apps Script.

## Setup

### 1. Install clasp

```bash
npm install -g @google/clasp
```

### 2. Login to clasp

```bash
clasp login
```

### 3. Create new Apps Script project

```bash
cd backend
clasp create --type webapp --title "Rememly Backend"
```

This will create a `.clasp.json` file with your script ID.

### 4. Push code to Apps Script

```bash
clasp push
```

### 5. Deploy as Web App

1. Open the script in the Apps Script editor:
   ```bash
   clasp open
   ```

2. In the editor:
   - Click on "Deploy" > "New deployment"
   - Select type "Web app"
   - Description: "Rememly API"
   - Execute as: "Me"
   - Who has access: "Anyone"
   - Click "Deploy"

3. Copy the Web App URL (you'll need this for the frontend `.env` file)

### 6. Configure Script Properties

In the Apps Script editor:

1. Go to Project Settings (⚙️ icon)
2. Scroll to "Script Properties"
3. Add the following properties:

   - `AUTHORIZED_EMAILS`: JSON array of authorized email addresses
     ```json
     ["your-email@gmail.com", "family-member@gmail.com"]
     ```

   - `SPREADSHEET_ID`: (Optional - will be created automatically on first run)

### 7. Set up Google Sheets

The spreadsheet and folder structure will be created automatically on first API call.

## API Endpoints

Base URL: `https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec`

### Authentication

- `POST /api/auth/check` - Check authentication

### Articles

- `GET /api/articles/list?year=2025&limit=20` - List articles
- `GET /api/articles/get?id=xxx` - Get article by ID
- `POST /api/articles/create` - Create article
- `POST /api/articles/update` - Update article

### PDF Generation

- `POST /api/pdf/create` - Create PDF job
- `GET /api/pdf/status?job_id=xxx` - Get PDF job status

## Development

### Watch mode

```bash
clasp push --watch
```

### View logs

```bash
clasp logs
```

## Project Structure

```
backend/
├── src/
│   ├── main.ts         # Entry point & routing
│   ├── auth.ts         # Authentication
│   ├── articles.ts     # CRUD articles
│   ├── drive.ts        # Google Drive operations
│   ├── sheets.ts       # Google Sheets operations
│   ├── jobs.ts         # PDF jobs management
│   ├── pdf.ts          # PDF generation
│   └── utils.ts        # Utilities
├── .clasp.json         # Clasp configuration
├── appsscript.json     # Apps Script manifest
└── README.md           # This file
```

## Google Drive Structure

The backend creates the following folder structure:

```
/Rememly/
  /2024/
    /originals/
    /assembled/
    /pdf/
  /2025/
    /originals/
    /assembled/
    /pdf/
```

## Google Sheets Structure

### Sheet: articles

| id | date_creation | date_modification | auteur | texte | image_url | image_file_id | year | assembly_state | full_page | status |
|----|---------------|-------------------|--------|-------|-----------|---------------|------|----------------|-----------|--------|

### Sheet: jobs_pdf

| job_id | created_at | created_by | year | date_from | date_to | status | progress | pdf_file_id | pdf_url | error_message |
|--------|------------|------------|------|-----------|---------|--------|----------|-------------|---------|---------------|

## Troubleshooting

### Permission errors

Make sure the Apps Script has the following OAuth scopes enabled in `appsscript.json`:
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/script.external_request`
- `https://www.googleapis.com/auth/userinfo.email`

### CORS errors

Web Apps deployed as "Anyone" should not have CORS issues. If you encounter them, make sure:
1. The deployment is set to "Anyone"
2. You're using the correct deployment URL
3. The `doPost` function is properly handling requests
