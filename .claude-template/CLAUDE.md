# Project Memory

> Keep this file under 200 lines. Use `@path/to/file` imports for detailed rules.

## Quick Reference

**Commands:**
- `npm run dev` — Start development server
- `npm run build` — Production build
- `npm run test` — Run test suite
- `npm run lint` — Lint and format

## Project Overview

<!-- CUSTOMIZE: Brief 2-3 sentence description of your project -->
[Project description goes here]

## Tech Stack

<!-- CUSTOMIZE: Update with your actual stack -->
- **Framework:** [e.g., Next.js 15, React, Vue]
- **Language:** [e.g., TypeScript 5.x, Python 3.12]
- **Styling:** [e.g., Tailwind CSS, CSS Modules]
- **Database:** [e.g., PostgreSQL, Supabase, SQLite]
- **Testing:** [e.g., Jest, Vitest, pytest]

## Key Directories

```
src/
├── components/    # Reusable UI components
├── lib/           # Core utilities and helpers
├── hooks/         # Custom React hooks
├── api/           # API routes/handlers
└── types/         # TypeScript type definitions
```

## Code Standards

### Style
- Use ES modules (`import/export`), not CommonJS
- Prefer functional components with hooks
- Destructure imports when possible
- 2-space indentation, single quotes

### Naming
- Components: PascalCase (`UserProfile.tsx`)
- Utilities: camelCase (`formatDate.ts`)
- Constants: SCREAMING_SNAKE_CASE
- Files: kebab-case for non-components

### Testing
- Tests live alongside source files (`.test.ts`)
- Write tests before implementation (TDD)
- Use descriptive test names

## Workflow Rules

### Before Coding
1. Read the PRD or task requirements fully
2. Ask clarifying questions if ambiguous
3. Create a brief plan before implementing

### During Development
- Work in small, focused increments
- Run tests after each significant change
- Commit frequently with clear messages

### Constraints
- Touch only files relevant to the current task
- No new dependencies without explicit approval
- Preserve existing patterns unless improving them

## Do NOT

- Edit files in `node_modules/` or `dist/`
- Commit directly to `main` branch
- Store secrets in code (use `.env`)
- Skip error handling for API calls
- Create overly generic abstractions

## Reference Documentation

For detailed guidelines, see:
- @.claude/rules/api-design.md
- @.claude/rules/testing.md
- @.claude/rules/git-workflow.md
- @.claude/rules/error-handling.md

## Project-Specific Notes

<!-- CUSTOMIZE: Add notes specific to your project -->
- [Add any project quirks, legacy patterns, or important context]

---

*Last updated: [DATE]*
*Use `/brainstorm` command to customize this file for your project*
