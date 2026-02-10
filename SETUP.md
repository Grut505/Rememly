# Rememly - Detailed Setup Guide

## Step-by-Step Installation

### Part 1: Google Cloud Setup

#### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project named "Rememly"
3. Note the Project ID

#### 2. Enable APIs

Enable the following APIs:
- Google Drive API
- Google Sheets API
- Google Apps Script API

#### 3. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Application type: "Web application"
4. Name: "Rememly PWA"
5. Authorized JavaScript origins:
   - `http://localhost:3000` (for development)
   - Your production domain (e.g., `https://rememly.netlify.app`)
6. Authorized redirect URIs:
   - `http://localhost:3000` (for development)
   - Your production domain
7. Click "Create"
8. Copy the **Client ID** (you'll need this for `.env`)

### Part 2: Backend Setup (Google Apps Script)

#### 1. Install clasp

```bash
npm install -g @google/clasp
```

#### 2. Login to Google

```bash
clasp login
```

This will open a browser window. Sign in with your Google account.

#### 3. Create Apps Script Project

```bash
cd backend
clasp create --type webapp --title "Rememly Backend"
```

This creates a `.clasp.json` file with your script ID.

#### 4. Push Code

```bash
clasp push
```

If prompted about manifest, choose "Yes".

#### 5. Deploy as Web App

```bash
clasp open
```

In the Apps Script editor:

1. Click "Deploy" > "New deployment"
2. Click the gear icon (⚙️) > "Web app"
3. Fill in:
   - **Description**: "Rememly API v1"
   - **Execute as**: Me (your email)
   - **Who has access**: Anyone
4. Click "Deploy"
5. **Copy the Web App URL** (it looks like: `https://script.google.com/macros/s/xxx/exec`)
6. Click "Done"

#### 6. Configure Script Properties

Still in the Apps Script editor:

1. Click the project settings icon (⚙️) in the left sidebar
2. Scroll down to "Script Properties"
3. Click "Add script property"
4. Add:
   - **Property**: `AUTHORIZED_EMAILS`
   - **Value**: `["your-email@gmail.com","family@gmail.com"]`

   ⚠️ **Important**: The value must be a valid JSON array with double quotes!

5. Click "Save script properties"

See `docs/ENVIRONMENT_VARIABLES.md` for the full list of Script Properties and GitHub Secrets.

#### 7. Test Backend

Test that the backend is working:

```bash
curl "YOUR_WEB_APP_URL?path=auth/check"
```

You should get a JSON response (may be an auth error, which is expected).

### Part 3: Frontend Setup

#### 1. Install Dependencies

```bash
cd frontend
npm install
```

#### 2. Create Environment File

Create `frontend/.env`:

```bash
cp .env.example .env
```

Edit `frontend/.env`:

```env
VITE_GOOGLE_CLIENT_ID=your_client_id_from_google_cloud
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/xxx/exec
```

Replace:
- `your_client_id_from_google_cloud`: Your OAuth 2.0 Client ID from Part 1
- `xxx`: Your Apps Script deployment ID from Part 2

#### 3. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Part 4: First Run

#### 1. Sign In

1. Open the app in your browser
2. Click "Sign in with Google"
3. Select your Google account
4. Grant permissions
5. You should be redirected to the timeline

If you get "User not authorized":
- Check that your email is in the `AUTHORIZED_EMAILS` script property
- Check that it's a valid JSON array with double quotes

#### 2. Create First Article

1. Click the "+" button
2. Select a photo
3. Add optional text
4. Click "Create"

The article should appear in the timeline.

#### 3. Check Google Drive

1. Go to [Google Drive](https://drive.google.com)
2. You should see a new folder called "Rememly"
3. Inside: `/2025/assembled/` with your first image

#### 4. Check Google Sheets

1. Go to [Google Sheets](https://docs.google.com/spreadsheets/)
2. You should see a new sheet called "Rememly Data"
3. Inside: "articles" sheet with your first article

### Part 5: Production Deployment

#### 1. Build Frontend

```bash
cd frontend
npm run build
```

This creates a `dist/` folder.

#### 2. Update OAuth Credentials

Go back to Google Cloud Console:
1. APIs & Services > Credentials
2. Edit your OAuth 2.0 Client ID
3. Add your production URL to:
   - Authorized JavaScript origins
   - Authorized redirect URIs
4. Save

#### 3. Update Frontend .env

If your production domain changed, rebuild and redeploy.

### Troubleshooting

#### "User not authorized" error

**Cause**: Your email is not in the whitelist or the JSON is malformed.

**Solution**:
1. Go to Apps Script editor
2. Check Project Settings > Script Properties
3. `AUTHORIZED_EMAILS` should look like:
   ```json
   ["email1@gmail.com","email2@gmail.com"]
   ```
4. Make sure to use double quotes, not single quotes

#### "Failed to load articles" error

**Cause**: Backend not reachable or authentication issue.

**Solution**:
1. Check `VITE_APPS_SCRIPT_URL` in `.env`
2. Make sure you deployed the backend as a Web App
3. Check that "Who has access" is set to "Anyone"
4. Try accessing the URL directly in a browser

#### CORS errors

**Cause**: Apps Script Web App not deployed correctly.

**Solution**:
1. Redeploy as Web App with "Anyone" access
2. Make sure you're using the Web App URL, not the script URL

#### Images not uploading

**Cause**: Google Drive API not enabled or permissions issue.

**Solution**:
1. Enable Google Drive API in Google Cloud Console
2. Check that Apps Script has Drive scope in `appsscript.json`
3. Reauthorize the script if needed

#### PDF generation failing

**Cause**: Timeout or insufficient permissions.

**Solution**:
1. Check Apps Script execution logs: `clasp logs`
2. Make sure the script has Sheets and Drive scopes
3. Try with fewer articles first

### Development Tips

#### Watch Backend Changes

```bash
cd backend
clasp push --watch
```

This will automatically push changes to Apps Script.

#### View Backend Logs

```bash
clasp logs
```

Or in the Apps Script editor: View > Logs

#### Clear Local Storage

In browser console:

```javascript
localStorage.clear()
location.reload()
```

#### Reset Database

To start fresh:
1. Delete the Google Sheet "Rememly Data"
2. Delete the Google Drive folder "Rememly"
3. Restart the app

The backend will recreate everything on next API call.

### Next Steps

1. Invite family members (add their emails to `AUTHORIZED_EMAILS`)
2. Start creating articles!
3. At the end of the year, generate your first PDF book
4. Enjoy your family memories

## Support

If you run into issues:
1. Check the troubleshooting section above
2. Check backend logs: `clasp logs`
3. Open a GitHub issue with:
   - Error message
   - Steps to reproduce
   - Browser console logs
   - Backend logs
