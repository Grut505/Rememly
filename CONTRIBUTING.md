# Contributing to Rememly

Thank you for your interest in contributing to Rememly!

## Development Setup

See [SETUP.md](SETUP.md) for detailed setup instructions.

## Code Structure

```
Rememly/
├── frontend/              # React PWA
│   ├── src/
│   │   ├── auth/         # Authentication logic
│   │   ├── api/          # API client
│   │   ├── screens/      # Main UI screens
│   │   ├── modules/      # Feature modules (photo assembly)
│   │   ├── services/     # Business logic
│   │   ├── state/        # State management
│   │   ├── ui/           # Reusable UI components
│   │   ├── hooks/        # Custom React hooks
│   │   └── utils/        # Utility functions
│   └── public/           # Static assets
├── backend/              # Google Apps Script
│   └── src/
│       ├── main.js       # HTTP routing
│       ├── auth.js       # Authentication
│       ├── articles.js   # CRUD operations
│       ├── drive.js      # Google Drive
│       ├── sheets.js     # Google Sheets + Config
│       ├── famileo.js    # Famileo integration
│       ├── jobs.js       # PDF jobs
│       ├── pdf.js        # PDF generation
│       └── utils.js      # Utilities
├── scripts/
│   └── famileo-refresh/  # GitHub Actions scripts
│       ├── login.js      # Puppeteer login to Famileo
│       ├── update-backend.js # Update session in backend
│       └── package.json
└── .github/
    └── workflows/
        └── famileo-refresh.yml # Nightly cookie refresh
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes

Follow the existing code style:
- **Frontend**: React functional components with TypeScript
- **Backend**: TypeScript with Google Apps Script APIs
- **Styling**: Tailwind CSS utility classes
- **State**: Zustand for global state

### 3. Test Your Changes

**Frontend**:
```bash
cd frontend
npm run dev
```

**Backend**:
```bash
cd backend
clasp push
```

Test thoroughly:
- Mobile responsive design (portrait orientation)
- Photo upload and display
- Article creation and editing
- PDF generation (if applicable)

### 4. Commit

Use clear, descriptive commit messages:

```bash
git commit -m "Add photo assembly grid template"
```

Follow conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `style:` Code style (formatting)
- `refactor:` Code refactoring
- `test:` Tests
- `chore:` Maintenance

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then open a Pull Request on GitHub with:
- Clear description of changes
- Screenshots (if UI changes)
- Testing steps
- Related issue number (if any)

## Code Style Guidelines

### TypeScript

- Use TypeScript strict mode
- Define interfaces for all data structures
- Avoid `any` type
- Use functional components (no class components)

### React

- Use functional components with hooks
- Keep components small and focused
- Extract reusable logic into custom hooks
- Use proper TypeScript types for props

### Tailwind CSS

- Use utility classes
- Follow mobile-first approach
- Keep custom CSS minimal
- Use Tailwind config for theme values

### File Naming

- React components: `PascalCase.tsx`
- Utilities/services: `camelCase.ts`
- Hooks: `useHookName.ts`
- Types: `types.ts` or inline interfaces

## Testing

Currently no automated tests. **All changes must be tested in the 3 deployment modes.**

### The 3 Testing Modes

Every feature must work correctly in these 3 distinct environments:

#### 1. Local Development (`npm run dev`)

```bash
cd frontend
npm run dev
```

- URL: `http://localhost:3000/`
- PORT: Always 3000
- Uses `.env` for environment variables
- Hot reload enabled
- Service worker may be disabled or behave differently
- Full browser DevTools access
- OAuth redirect configured for localhost

#### 2 & 3. GitHub Pages (Browser + Standalone PWA)

```bash
cd frontend
npm run deploy
```

This single command builds and deploys to GitHub Pages. Both modes use the same deployment:

**Mode 2 - Browser:** Accéder via `https://grut505.github.io/` dans un navigateur

**Mode 3 - Standalone PWA:** Même URL, mais installée sur téléphone ("Ajouter à l'écran d'accueil")

- URL: `https://grut505.github.io/`
- Uses `.env.production` for environment variables
- Full PWA with service worker caching
- OAuth redirect configured for GitHub Pages domain

**Différences du mode Standalone (installé sur téléphone) :**
- Runs in `display: standalone` mode (no browser UI)
- `window.matchMedia('(display-mode: standalone)')` returns true
- Different caching behavior (more aggressive)
- No address bar = no easy refresh (must rely on pull-to-refresh or in-app controls)
- OAuth popups may behave differently
- Network errors less visible to user
- App updates require explicit reload logic
- Some APIs behave differently (clipboard, share, etc.)

### Why These 3 Modes Matter

| Aspect | Local | GitHub Pages (Browser) | Standalone PWA |
|--------|-------|------------------------|----------------|
| Service Worker | Often disabled | Active | Active + cached |
| OAuth Flow | Popup works | Popup works | May need redirect flow |
| Network Errors | Easy to debug | Visible in DevTools | Hidden from user |
| App Updates | Instant (HMR) | Refresh loads new | Requires update prompt |
| API URL | Dev backend | Prod backend | Prod backend |
| CORS | Localhost allowed | GitHub Pages allowed | Same as browser |

### Testing Checklist

Before any PR, verify in **all 3 modes**:

- [ ] Mobile viewport (375px width)
- [ ] Portrait orientation only
- [ ] Photo upload works
- [ ] Photo assembly works with all templates
- [ ] Zoom/pan controls work
- [ ] Article creation/editing works
- [ ] Timeline loads and scrolls
- [ ] Filters work
- [ ] Stats display correctly
- [ ] PDF generation works (create job, poll status, download)

**Standalone PWA specific checks:**
- [ ] App launches correctly from home screen
- [ ] Login/OAuth works without browser UI
- [ ] App update prompt appears when new version deployed
- [ ] Offline behavior is graceful (if applicable)

## Adding New Features

Before adding a new feature:

1. Check the specifications in [specs/](specs/)
2. Ensure it aligns with the project goals:
   - Family-focused
   - Mobile-first
   - Simple and intuitive
   - No external services
   - Privacy-first

3. Open an issue to discuss if it's a significant feature

## Reporting Bugs

Open an issue with:
- Clear title and description
- Steps to reproduce
- Expected vs actual behavior
- Screenshots (if applicable)
- Browser and OS information
- Console errors (if any)

## Famileo Integration

### Architecture Overview

Famileo is integrated to import family posts from the Famileo service. The integration handles automatic session management since Famileo uses cookie-based authentication that expires regularly.

```
┌─────────────────────────────────────────────────────────────────┐
│                  GitHub Actions (On-demand)                      │
│  ┌─────────────────┐    ┌──────────────────┐                    │
│  │  login.js       │───>│ update-backend.js│                    │
│  │  (Puppeteer)    │    │                  │                    │
│  │  - Login        │    │  - POST cookies  │                    │
│  │  - Get cookies  │    │    to backend    │                    │
│  └─────────────────┘    └────────┬─────────┘                    │
└──────────────────────────────────┼──────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (Apps Script)                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  famileo/update-session endpoint                          │   │
│  │  - Validates secret token                                 │   │
│  │  - Stores cookies in Google Sheet (config tab)            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  famileo/posts endpoint                                   │   │
│  │  - Reads cookies from config sheet                        │   │
│  │  - Fetches posts from Famileo API                         │   │
│  │  - Filters by allowed authors                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  famileo/image endpoint                                   │   │
│  │  - Proxies images from Famileo CDN                        │   │
│  │  - Returns base64 to avoid CORS issues                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend (PWA)                              │
│  - Calls famileo/posts to get posts                             │
│  - Displays posts in timeline                                    │
│  - Calls famileo/image to load images                           │
└─────────────────────────────────────────────────────────────────┘
```

### Components

#### 1. GitHub Actions Workflow (`.github/workflows/famileo-refresh.yml`)

Runs on-demand via `workflow_dispatch` (manual trigger) when a session refresh is needed.

**Steps:**
1. Installs Puppeteer
2. Runs `login.js` - logs into Famileo and extracts cookies
3. Runs `update-backend.js` - sends cookies to backend API

**Required Secrets (GitHub → Settings → Secrets → Actions):**
- `FAMILEO_EMAIL` - Famileo login email
- `FAMILEO_PASSWORD` - Famileo login password
- `BACKEND_URL` - Apps Script web app URL
- `BACKEND_SECRET_TOKEN` - Secret token to authenticate with backend

#### 2. Puppeteer Login Script (`scripts/famileo-refresh/login.js`)

- Launches headless Chrome
- Navigates to Famileo login page
- Fills in credentials and submits
- Extracts `PHPSESSID` and `REMEMBERME` cookies
- Saves to `cookies.json` for next step

#### 3. Backend Update Script (`scripts/famileo-refresh/update-backend.js`)

- Reads cookies from `cookies.json`
- POSTs to `{BACKEND_URL}?path=famileo/update-session`
- Includes secret token for authentication

#### 4. Backend Endpoints (`backend/src/famileo.js`)

| Endpoint | Auth | Description |
|----------|------|-------------|
| `famileo/update-session` | Secret token | Stores new cookies in config sheet |
| `famileo/posts` | User token | Fetches posts from Famileo API |
| `famileo/image` | User token | Proxies images as base64 |
| `famileo/status` | User token | Checks if session is configured |

#### 5. Config Storage (`backend/src/sheets.js`)

Cookies are stored in a `config` sheet tab:

| key | value | updated_at |
|-----|-------|------------|
| famileo_session | `{"PHPSESSID":"...","REMEMBERME":"..."}` | 2026-01-15T12:30:00Z |

### Setup Instructions

1. **Configure GitHub Secrets:**
   ```
   FAMILEO_EMAIL=your-email@example.com
   FAMILEO_PASSWORD=your-password
   BACKEND_URL=https://script.google.com/macros/s/.../exec
   BACKEND_SECRET_TOKEN=<generate with: openssl rand -hex 32>
   ```

2. **Configure Apps Script Properties:**
   - Go to Apps Script → Project Settings → Script Properties
   - Add: `FAMILEO_UPDATE_TOKEN` = same value as `BACKEND_SECRET_TOKEN`

3. **Test manually:**
   - Go to GitHub → Actions → "Refresh Famileo Session"
   - Click "Run workflow"
   - Check the config sheet for updated cookies

### Troubleshooting

**"Session expired" error:**
- The app auto-triggers a refresh when the session is invalid
- If needed, you can still trigger the GitHub Action manually as a fallback

**"Endpoint not found" error:**
- Check that the backend URL in GitHub Secrets matches the current Apps Script deployment
- After updating Apps Script code, create a new deployment and update `BACKEND_URL`

**Login fails in GitHub Actions:**
- Check `FAMILEO_EMAIL` and `FAMILEO_PASSWORD` secrets
- Famileo may have changed their login page structure
- Check the error screenshot in the workflow logs

**"AUTH_REQUIRED" error from backend:**
- Ensure the backend was redeployed after adding the `famileo/update-session` endpoint
- The endpoint must be handled BEFORE the auth check in `main.js`

### Security Notes

- Famileo credentials are stored only in GitHub Secrets (never in code)
- Backend secret token is stored in Apps Script Properties (never in code)
- Cookies are stored in Google Sheet (access controlled by Google account)
- The `famileo/update-session` endpoint uses a secret token, not user authentication

## Questions?

Open an issue or discussion on GitHub.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
