# Ghost-Machine

**RepoPilot** is an AI-assisted GitHub portfolio manager that helps developers understand their repositories, remember unfinished work, and decide what to work on next.

The project is being developed for the DEV Hacktoberfest Week 4 challenge, *Ghost in the Machine*. It will use open-source AI as a core capability rather than adding AI only as decoration.

## Planned features

- A unified dashboard for GitHub repositories.
- Search and filter projects by name, technology, and workflow status.
- Repository summaries grounded in README files, commits, issues, releases, and CI signals.
- User-controlled project statuses, notes, and priorities.
- Suggested next steps and a project-revival report for older repositories.
- Optional local AI analysis through Ollama and an open-weight model.

## Current status

The initial UI prototype is being built. It uses clearly labeled sample repository data and does **not** yet connect to GitHub or run AI analysis. GitHub OAuth, persistent storage, repository scanning, and model integration are planned follow-up milestones.

## Tech stack

- Next.js App Router and React
- TypeScript
- Tailwind CSS
- Lucide icons
- PostgreSQL and Prisma (planned)
- GitHub OAuth and GitHub REST API (planned)
- Ollama with an open-weight model (planned)

## Getting started

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment configuration

Copy `.env.example` to `.env.local` when configuring integrations. Never commit real credentials or tokens.

## Development commands

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
```

## Security principles

- Request the minimum GitHub permissions needed.
- Keep OAuth credentials and access tokens server-side.
- Never send secrets, environment files, or private keys to an AI model.
- Treat model output as suggestions and show supporting evidence.
- Let users override AI status recommendations.

## License

See [LICENSE](./LICENSE).
