# Contributing to Rememly

Thank you for your interest in contributing to Rememly!

## Development Setup

See [SETUP.md](SETUP.md) for detailed setup instructions.

## Code Structure

```
Rememly/
├── frontend/         # React PWA
│   ├── src/
│   │   ├── auth/    # Authentication logic
│   │   ├── api/     # API client
│   │   ├── screens/ # Main UI screens
│   │   ├── modules/ # Feature modules (photo assembly)
│   │   ├── services/# Business logic
│   │   ├── state/   # State management
│   │   ├── ui/      # Reusable UI components
│   │   ├── hooks/   # Custom React hooks
│   │   └── utils/   # Utility functions
│   └── public/      # Static assets
└── backend/         # Google Apps Script
    └── src/
        ├── main.ts  # HTTP routing
        ├── auth.ts  # Authentication
        ├── articles.ts # CRUD operations
        ├── drive.ts # Google Drive
        ├── sheets.ts # Google Sheets
        ├── jobs.ts  # PDF jobs
        ├── pdf.ts   # PDF generation
        └── utils.ts # Utilities
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

Currently no automated tests. Manual testing checklist:

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

## Questions?

Open an issue or discussion on GitHub.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
