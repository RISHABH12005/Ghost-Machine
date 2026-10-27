# RepoPilot (Ghost-Machine)

RepoPilot is a GitHub repository dashboard for developers who want to understand their projects, keep track of unfinished work, and decide what to revisit next.

The current implementation imports public repository metadata and offers an on-demand, heuristic assessment based on public GitHub activity. AI-generated summaries and project-revival guidance are planned, not yet implemented.

## Features

- Import public repositories for a GitHub username.
- Search repositories by name, description, language, and topics.
- Assign manual project statuses, including an explicit "Not assessed" state.
- Request an on-demand assessment based on archive state, open pull requests and requested reviewers, recent workflow runs, and push activity.
- Review evidence links, confidence, and limitations before applying a suggested status.
- See public metadata such as description, language, stars, topics, update date, and open issue count.
- Keep manual status selections in browser local storage.
- Use a responsive dark dashboard with loading, empty, and error states.

## Tech stack

- Next.js App Router and React
- TypeScript
- Tailwind CSS
- Lucide React
- GitHub REST API for public repository data

PostgreSQL, GitHub OAuth, persistent accounts, semantic search, and Ollama-based summaries are planned.

## Requirements

- Node.js 22
- npm

## Run locally

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Validate the project

```bash
npm run typecheck
npm run lint
npm run build
npm audit
```

GitHub Actions runs type-checking, lint, a production build, production-route smoke tests, and an npm security audit for changes to `main` and pull requests targeting `main`.

## Environment configuration

The public repository importer currently does not require a GitHub token. If adding integrations, copy `.env.example` to `.env.local` and configure values locally. Never commit real credentials, access tokens, or private keys.

## Security and limitations

- Only public, non-fork repositories are imported by the current UI.
- Private repository access requires an explicit GitHub OAuth flow and server-side token storage; it is not implemented.
- Project statuses are saved in browser local storage and are not synchronized across devices.
- Assessment results are heuristic signals from the public GitHub API, not AI verdicts. They may be incomplete or rate-limited.
- Security alerts and private-repository analysis are unavailable without authorized GitHub access.
- Inactivity does not prove that a project is abandoned or complete. "Completed" should remain a human decision.
- Treat recommendations as suggestions and inspect their evidence before applying them.

## License

See [LICENSE](./LICENSE).
