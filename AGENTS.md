# AGENTS.md

## Purpose
- This file gives coding agents the working conventions for the Rememly repository.
- Prefer small, targeted changes that match existing frontend and backend patterns.
- Respect existing mixed English/French domain naming; many API and sheet fields intentionally stay in French.

## Repository Overview
- `frontend/`: React 18 + TypeScript + Vite PWA.
- `backend/`: Google Apps Script backend deployed with `clasp` from `backend/src`.
- `scripts/famileo-refresh/`: Node scripts used by GitHub Actions to refresh Famileo sessions.
- `.github/workflows/`: operational workflows for PDF merge and Famileo refresh.
- `docs/`: setup and environment documentation.

## Instruction Files Checked
- `AGENTS.md`: this file is the canonical agent guide in this repo.
- `.cursorrules`: not present.
- `.cursor/rules/`: not present.
- `.github/copilot-instructions.md`: not present.
- No Cursor or Copilot rule files were found during analysis, so there are no extra rule layers to merge in.

## Install And Setup
- Root install shortcut: `npm run install:all` from `/home/ygraufogel/claude/Rememly` installs frontend dependencies only.
- Frontend direct install: `npm install` in `frontend/`.
- Backend tooling install: `npm install` in `backend/` installs `@google/clasp` locally.
- Famileo refresh script install: `npm install` in `scripts/famileo-refresh/`.

## Build, Lint, Test, And Run Commands

### Root
- Start frontend dev server: `npm run dev`
- Build frontend: `npm run build`
- Preview frontend build: `npm run preview`
- Root scripts are thin wrappers that `cd frontend && ...`; they do not cover backend tasks.

### Frontend (`frontend/`)
- Start dev server: `npm run dev`
- Production build: `npm run build`
- Preview production build locally: `npm run preview`
- Lint all frontend source: `npm run lint`
- Deploy static frontend: `npm run deploy`
- Build behavior: `npm run build` runs `tsc && vite build`, so TypeScript checking is part of the build.
- Lint behavior: ESLint runs on all `ts` and `tsx` files and fails on warnings (`--max-warnings 0`).

### Backend (`backend/`)
- Push Apps Script code: `npm run push`
- Deploy Apps Script using the configured deployment ID: `npm run deploy`
- Placeholder test command: `npm test`
- Important: current backend `npm test` intentionally fails with `Error: no test specified`.
- Apps Script source root is `backend/src/` as defined by `backend/.clasp.json`.

### Famileo Refresh Script (`scripts/famileo-refresh/`)
- Run interactive/login refresh script: `npm run login`
- Push new session data back to backend: `npm run update`

## Single-Test Guidance
- There is no configured automated test runner in this repository today.
- No `*.test.*` or `*.spec.*` files were found.
- No Jest, Vitest, Playwright, Cypress, or Testing Library package/config files were found.
- Therefore there is currently no supported "run one test" command.
- If you are asked to validate a change, use the narrowest available command instead:
  - frontend type/build validation: `cd frontend && npm run build`
  - frontend lint validation: `cd frontend && npm run lint`
  - backend deploy-time validation: review affected handler paths and, if appropriate, use `cd backend && npm run push`
- Do not invent a single-test command in commits or docs unless a real test framework is added.

## Operational Notes
- Frontend local URL is `http://localhost:3000` per Vite config.
- Frontend uses Vite PWA with `vite-plugin-pwa`; preserve manifest and caching behavior unless the task requires changes.
- Backend runs as a Google Apps Script web app with anonymous access and app-level auth checks.
- Backend scopes are declared in `backend/src/appsscript.json`; preserve them unless the feature truly needs scope changes.
- GitHub Actions workflows are operational scripts, not general build/test pipelines.

## Tech Stack Summary
- Frontend: React, TypeScript, React Router, Zustand, Tailwind CSS, Vite, PWA support, IndexedDB via `idb`.
- Backend: Google Apps Script on V8 runtime, Google Sheets, Google Drive, `clasp` deployment.
- Auxiliary scripts: Node.js plus Puppeteer for Famileo automation.

## General Code Style
- Match existing style before applying generic best practices.
- Use 2-space indentation across frontend, backend, config, and workflow files unless a file clearly differs.
- Frontend code is semicolon-free; keep it that way in `frontend/`.
- Backend Apps Script code uses semicolons consistently; keep them in `backend/src/`.
- Prefer single quotes in JavaScript and TypeScript.
- Keep functions and components relatively small, with helpers extracted when logic becomes reusable or hard to scan.
- Avoid broad rewrites or cleanup-only edits unless the task explicitly asks for them.

## Imports
- Follow the existing import order: external packages first, then local relative imports.
- Use relative imports; no path alias setup was found in the frontend.
- Keep imports grouped tightly without excessive blank lines.
- Use named imports where the codebase already does so.
- `import type` is rare but acceptable when it improves clarity; do not refactor files only to add it.

## Frontend TypeScript Conventions
- `frontend/tsconfig.json` has `strict: true`; do not weaken strictness.
- Prefer explicit interfaces and type aliases for API shapes, props, store state, and modal payloads.
- Use union types for constrained states such as article status values.
- Add generics where the repository already benefits from them, especially API client helpers and stores.
- Avoid `any`; use `unknown` plus narrowing when necessary.
- Preserve backend-driven field names in types, even when they use snake_case or French identifiers.
- Use named function components instead of `React.FC`.
- Keep hooks named `useX` and providers/components in PascalCase.

## Frontend Component And State Patterns
- Typical file structure is: imports, local interfaces/types, component function, local handlers/effects, JSX return.
- Use React hooks directly in components; most screens rely on `useState`, `useEffect`, `useRef`, and router hooks.
- Shared state uses Zustand stores in `frontend/src/state/` and `frontend/src/stores/`.
- Auth and profile concerns use React context providers.
- Prefer existing service and API layers over adding fetch calls directly inside multiple components.
- When changing API behavior, update the relevant types, API wrappers, and consuming UI together.

## Frontend Styling Conventions
- Styling is primarily Tailwind utility classes inside JSX.
- Reuse existing UI components in `frontend/src/ui/` before creating one-off button, modal, input, or spinner variants.
- Global CSS belongs in `frontend/src/index.css`; keep it minimal and utility-oriented.
- Theme tokens are extended in `frontend/tailwind.config.js`; use those values instead of hardcoding new palettes when possible.
- Preserve mobile-first behavior and portrait-oriented UX assumptions.
- Be careful with safe-area utilities and bottom-fixed controls; several screens depend on them.

## Naming Conventions
- React components, screens, providers, and modal components: PascalCase filenames and exports.
- Hooks: camelCase filenames beginning with `use`.
- Stores and utilities: camelCase filenames.
- Service files often use dotted lowercase names like `articles.service.ts`; follow the local pattern in that folder.
- Backend files are lowercase JavaScript filenames, sometimes snake_case for domain-specific modules.
- Keep domain fields such as `auteur`, `texte`, `image_url`, `image_file_id`, and `famileo_post_id` unchanged unless a schema migration is intentional.

## Error Handling
- Frontend user-visible failures generally surface through `showToast(..., 'error')`; use that for recoverable UI errors.
- Frontend setup failures may throw `new Error(...)`, especially when execution cannot continue.
- Preserve existing auth failure flow: clear stored user state and redirect to `/auth` when the API indicates auth problems.
- Backend handlers should return `createResponse({ ok, data, error })` rather than raw values.
- Backend errors commonly use structured codes like `NOT_FOUND`, `FORBIDDEN`, or `INTERNAL_ERROR`; keep that style.
- Use `Logger.log(...)` for backend diagnostics and `console.error`/`console.warn` sparingly in the frontend.

## Backend Apps Script Conventions
- Backend code is procedural, top-level, and global-scope friendly for Apps Script; do not introduce unsupported module patterns.
- Keep request routing centralized in `backend/src/main.js` via `doGet` and `doPost` dispatch.
- New endpoints should follow the existing `handleX` naming convention.
- Helper functions commonly use `getX`, `findX`, `buildX`, `ensureX`, and `normalizeX` names.
- Preserve JSON response structure and existing parameter names expected by the frontend and GitHub Actions.
- Be cautious with Drive and Sheets mutations; many operations are effectively production behavior.

## Validation Expectations For Agents
- For frontend-only changes, run the narrowest meaningful validation first:
  - `cd frontend && npm run lint`
  - `cd frontend && npm run build`
- For backend-only changes, there is no real local test suite; validate by reviewing handler wiring and data shape consistency.
- For script changes under `scripts/famileo-refresh/`, at minimum ensure dependencies and entrypoints still match the workflow commands.
- If a change affects both frontend and backend contracts, verify both the frontend build and the relevant backend request/response fields.

## What Not To Do
- Do not rename French or snake_case API fields just to make them more idiomatic in TypeScript.
- Do not replace relative imports with aliases unless the repository is explicitly reconfigured.
- Do not add a test command section claiming support for single-file or single-test execution when none exists.
- Do not switch backend files to semicolon-free formatting.
- Do not introduce a new state management pattern when Zustand or context already covers the use case.

## Quick Agent Checklist
- Identify whether the change belongs to `frontend/`, `backend/`, or `scripts/`.
- Reuse existing services, stores, UI primitives, and handler naming.
- Preserve mixed English/French domain vocabulary.
- Run relevant lint/build validation where available.
- Call out clearly when no automated test coverage exists for the affected area.
