# Ghost-Machine

**RepoPilot** is an AI-assisted GitHub portfolio manager that helps developers understand their repositories, remember unfinished work, and decide what to work on next.

This project is being developed for the DEV Hacktoberfest Week 4 challenge, *Ghost in the Machine*. Open-source AI is planned as a core capability for repository summaries and project-revival guidance.

## Current features

- Import public repositories for any GitHub username.
- Search repository names, descriptions, languages, and topics.
- Filter repositories by a user-selected project status.
- View live public metadata such as description, language, stars, update date, topics, and open issue count.
- Store manual status choices in the current browser.
- Responsive dark dashboard with loading, empty, and error states.

## Planned features

- GitHub OAuth for importing private repositories the user authorizes.
- Persistent user accounts and project notes.
- Repository analysis grounded in README files, commits, issues, releases, and CI results.
- Ollama integration with an open-weight model for summaries and next-step suggestions.
- Project revival reports and semantic search.

## Tech stack

- Next.js App Router and React
- TypeScript
- Tailwind CSS
- Lucide icons
- GitHub REST API (public repository import implemented)
- PostgreSQL and Prisma (planned)
- GitHub OAuth (planned)
- Ollama with an open-weight model (planned)

## Getting started

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment configuration

Copy `.env.example` to `.env.local` when configuring integrations. Never commit real credentials or tokens. The public repository importer currently requires no GitHub token.

## Development commands

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
```

## Current limitations

- Only public, non-fork repositories are imported by the current UI.
- Private repository access is not implemented; it requires a proper GitHub OAuth flow and server-side token storage.
- Project statuses are saved in browser local storage and are not synced across devices.
- Statuses are manual and are not yet inferred by AI.
- Build and CI results should be checked in GitHub Actions before considering this prototype production-ready.

## Security principles

- Request the minimum GitHub permissions needed.
- Keep OAuth credentials and access tokens server-side.
- Never send secrets, environment files, or private keys to an AI model.
- Treat model output as suggestions and show supporting evidence.
- Let users override AI status recommendations.

## License

See [LICENSE](./LICENSE).
