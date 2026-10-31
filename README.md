# RepoPilot (Ghost-Machine)

RepoPilot is a GitHub repository dashboard for developers who want to understand their projects, keep track of unfinished work, and decide what to revisit next.

The current implementation imports public repository metadata and offers an on-demand, heuristic assessment based on public GitHub activity. AI-generated summaries and project-revival guidance are planned, not yet implemented.

## Features

- Sign in with GitHub OAuth and import repositories authorized for your account, including private repositories.
- Import public repositories for any GitHub username without signing in.
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
- GitHub REST API with OAuth-authenticated repository access

PostgreSQL-backed cross-device accounts, semantic search, and Ollama-based summaries are planned.

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

Copy `.env.example` to `.env.local` and configure `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URI`, and a strong `AUTH_SECRET`. Register the exact callback URL `https://YOUR-DOMAIN/api/auth/callback` in a GitHub OAuth App. For Render, add the same values in the service environment settings and set the redirect URI to `https://repopilot-9tal.onrender.com/api/auth/callback`. The OAuth app requests `read:user` and `repo` scopes; GitHub's `repo` scope is broad and permits repository write access, so only authorize an account you trust. Sessions are encrypted into an HttpOnly, Secure-in-production, SameSite=Lax cookie and expire after 8 hours. Tokens are never returned to browser JavaScript. Never commit real credentials, access tokens, or private keys.

## Security and limitations

- Without signing in, only public, non-fork repositories are imported. After GitHub OAuth, the app can list repositories the authorized account can access, including private repositories.
- Project statuses are saved in browser local storage and are not synchronized across devices.
- Assessment results are heuristic signals from the public GitHub API, not AI verdicts. They may be incomplete or rate-limited.
- The current OAuth integration uses GitHub's broad `repo` scope to read private repository metadata. A GitHub App with narrower read-only permissions is preferable for a production multi-user deployment.
- Inactivity does not prove that a project is abandoned or complete. "Completed" should remain a human decision.
- Treat recommendations as suggestions and inspect their evidence before applying them.

## License

See [LICENSE](./LICENSE).
