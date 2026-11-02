# Project structure

Ghost-Machine is a Next.js App Router application. Keep framework entry points and build configuration in their expected locations; group feature code by responsibility.

```text
Ghost-Machine/
├── .github/
│   └── workflows/                 # CI and repository automation
├── docs/
│   └── PROJECT_STRUCTURE.md       # Architecture and folder conventions
├── src/
│   ├── app/                       # Next.js routes, layouts, styles, and API handlers
│   │   └── api/                   # HTTP route handlers grouped by capability
│   ├── components/
│   │   ├── auth/                  # Sign-in UI
│   │   ├── dashboard/             # Main RepoPilot dashboard
│   │   └── workspace/             # Authenticated workspace shell
│   ├── lib/
│   │   └── auth/                  # Session and authentication helpers
│   └── types/
│       └── github/                # GitHub and repository domain types
├── supabase/
│   └── migrations/                # Versioned PostgreSQL schema changes
├── .env.example                  # Documented environment variables only
├── README.md
├── LICENSE
├── package.json
├── package-lock.json
└── Next.js / TypeScript / CSS configuration files
```

## Placement rules

- Keep `src/app/**/page.tsx`, `layout.tsx`, `globals.css`, and `api/**/route.ts` in the App Router tree. Their paths define public URLs and API endpoints.
- Put reusable visual components in `src/components/<feature>/`.
- Put server-side helpers in `src/lib/<concern>/`; never place credentials in source files.
- Put shared domain types in `src/types/<domain>/`.
- Keep Supabase SQL migrations in `supabase/migrations/`.
- Keep GitHub Actions under `.github/workflows/`.
- Keep `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, and tool configuration files at the repository root. Package managers and build tools discover these files there by convention.
- Do not commit local `.env` files, build output, caches, or dependencies.
