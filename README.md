# Rememly

A Progressive Web App (PWA) for creating and managing family photo articles and generating yearly photo books as printable PDFs.

## Features

- **Mobile-First PWA**: Optimized for smartphone use with portrait orientation
- **Photo Articles**: Create articles with single or assembled photos (up to 10 photos)
- **Photo Assembly**: Create photo collages using predefined templates with zoom/pan controls
- **Timeline View**: Browse articles chronologically with infinite scroll
- **Filters**: Filter articles by year, month, or custom date range
- **Statistics**: View article counts by month and year
- **PDF Generation**: Generate annual photo books in A4 format with cover, month dividers, and articles
- **Google Workspace Integration**: Uses Google Sheets for data and Google Drive for storage
- **Offline Support**: Service Worker for caching and offline access
- **Private & Secure**: Whitelist-based authentication, no public sharing

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and optimized builds
- **Tailwind CSS** for mobile-first styling
- **Zustand** for state management
- **IndexedDB** for local draft storage
- **PWA** with service worker and manifest

### Backend
- **Google Apps Script** (deployed as Web App)
- **Google Sheets** for article metadata
- **Google Drive** for image and PDF storage
- **clasp** for local development and deployment

## Project Structure

```
Rememly/
├── frontend/              # React PWA
│   ├── src/
│   │   ├── auth/         # Authentication
│   │   ├── api/          # API client
│   │   ├── screens/      # Main screens
│   │   ├── modules/      # Photo assembly module
│   │   ├── services/     # Business logic
│   │   ├── state/        # State management
│   │   ├── ui/           # Reusable components
│   │   └── utils/        # Utilities
│   ├── public/           # Static assets
│   └── package.json
├── backend/              # Google Apps Script
│   ├── src/
│   │   ├── main.ts       # Entry point
│   │   ├── auth.ts       # Authentication
│   │   ├── articles.ts   # CRUD operations
│   │   ├── drive.ts      # Google Drive
│   │   ├── sheets.ts     # Google Sheets
│   │   ├── jobs.ts       # PDF jobs
│   │   ├── pdf.ts        # PDF generation
│   │   └── utils.ts      # Utilities
│   └── appsscript.json
└── specs/                # Specifications
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Google account
- Google Cloud project with OAuth 2.0 credentials

### 1. Clone the repository

```bash
git clone <repository-url>
cd Rememly
```

### 2. Setup Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env` from the example:

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `VITE_GOOGLE_CLIENT_ID`: Your Google OAuth 2.0 Client ID
- `VITE_APPS_SCRIPT_URL`: Your Apps Script Web App URL (set this after backend deployment)

### 3. Setup Backend

```bash
# Install clasp globally
npm install -g @google/clasp

# Login to Google
clasp login

# Navigate to backend folder
cd backend

# Create new Apps Script project
clasp create --type webapp --title "Rememly Backend"

# Push code to Apps Script
clasp push
```

Deploy as Web App:

```bash
# Open Apps Script editor
clasp open
```

In the editor:
1. Deploy > New deployment
2. Type: Web app
3. Execute as: Me
4. Who has access: Anyone
5. Deploy
6. Copy the Web App URL to `frontend/.env` as `VITE_APPS_SCRIPT_URL`

Configure Script Properties:
1. Go to Project Settings
2. Add Script Property:
   - Key: `AUTHORIZED_EMAILS`
   - Value: `["your-email@gmail.com"]` (JSON array)

See [backend/README.md](backend/README.md) for detailed backend setup.

### 4. Run Development Server

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Build for Production

```bash
cd frontend
npm run build
```

## Deployment

### Frontend (GitHub Pages)

The frontend is deployed to GitHub Pages at `grut505.github.io`.

```bash
cd frontend
npm run deploy
```

This command:
1. Builds the project (`npm run build`)
2. Pushes the `dist/` folder to the GitHub Pages repository

### Backend (Google Apps Script)

The backend uses a specific deployment ID that the frontend references.

**Current Deployment ID:** `AKfycbwnwljzz7VuZNvAc-Y675huhQdRMkm6Eg_aOhPGuOOvy0l1Y3g0KjUhoLfN3IFf2bSL`

To update the backend:

```bash
cd backend

# Push code changes
npx clasp push

# Update the existing deployment (keeps the same URL)
npx clasp deploy -i AKfycbwnwljzz7VuZNvAc-Y675huhQdRMkm6Eg_aOhPGuOOvy0l1Y3g0KjUhoLfN3IFf2bSL -d "Description of changes"
```

**Important:** Always use `-i <DEPLOYMENT_ID>` to update the existing deployment. Creating a new deployment generates a different URL that would require updating the frontend `.env` file.

## Usage

1. **Sign In**: Authenticate with your Google account (must be in whitelist)
2. **Create Article**: Tap the + button to create a new photo article
3. **Add Photo**: Select a single photo or use the assembly feature for multiple photos
4. **Assemble Photos**: Choose a template, add photos, adjust zoom/position
5. **Add Text**: Optionally add a description (max 300 characters)
6. **View Timeline**: Browse all articles sorted by modification date
7. **Filter**: Use filters to view articles by year, month, or date range
8. **Statistics**: View article counts by month
9. **Generate PDF**: Create an annual photo book in PDF format

## Photo Assembly Templates

- **2×1 Vertical**: Two photos stacked vertically
- **2×1 Horizontal**: Two photos side by side
- **4×4 Grid**: Four photos in a grid
- **3+2**: Three full-width photos with two half-width at bottom
- **3+2+2**: One large photo with two rows of two photos

## PDF Structure

Generated PDFs include:
- **Cover page** with year and photo mosaic
- **Month dividers** (January - December)
- **Article pages** (2 articles per page or full page)
- **Pagination** throughout

## Architecture Highlights

- **Mobile-First**: Portrait orientation, touch-optimized
- **Offline-Ready**: Service Worker caching
- **Image Optimization**: Client-side compression and EXIF correction
- **Asynchronous PDF**: Jobs system with progress tracking
- **Data Privacy**: No external services, whitelist authentication
- **Durable**: Designed for multi-year family use

## Specifications

Detailed specifications are in the [specs/](specs/) folder:

- **SPEC-001**: Architecture & Storage
- **SPEC-002**: UI/UX
- **SPEC-003**: Photo Assembly Module
- **SPEC-004**: PDF Generation
- **SPEC-005**: Integration & Wiring
- **SPEC-006**: Edge Cases & Durability

## License

MIT

## Contributing

This is a family project. Contributions are welcome via pull requests.

## Support

For issues and questions, please open a GitHub issue.
