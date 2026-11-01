# RepoPilot

RepoPilot is a GitHub repository workspace that helps developers review project activity, track work, and decide what to do next.

It connects to GitHub, imports repositories that the signed-in account can access, and combines repository metadata with optional AI assistance from Ollama Cloud.

## Features

- **GitHub sign-in:** OAuth authentication and access to repositories authorized for the connected account, including private repositories.
- **Repository discovery:** Import public repositories by username or load the connected account's repositories.
- **Repository search:** Search by repository name, description, language, and topics.
- **Project tracking:** Assign statuses such as Not assessed, Needs review, In progress, Needs attention, Completed, and On hold.
- **Repository assessment:** Review heuristic signals from archive state, open pull requests, requested reviewers, workflow runs, and push activity. Suggestions are not applied automatically.
- **AI summaries and chat:** Ask repository-aware questions and generate summaries using Ollama Cloud. AI requests use GitHub metadata, open issues and pull requests, recent workflow data, and the README where available; source files and secrets are not sent.
- **Activity and insights:** Review workspace activity and GitHub contribution/insight data.
- **Local workspace preferences:** Store project status and workspace usage preferences in the browser.
- **Responsive dark interface:** Dashboard, repository list, work board, priorities, activity, and settings views.

## Technology

| Area | Technology |
|---|---|
| Application | Next.js App Router, React |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| GitHub integration | GitHub REST API and OAuth |
| AI | Ollama Cloud chat API |
| Validation | GitHub Actions, ESLint, TypeScript, npm audit |

## Requirements

- Node.js 22 or later
- npm

## Run locally

1. Clone the repository and enter the project directory:

   ```bash
   git clone https://github.com/RISHABH12005/Ghost-Machine.git
   cd Ghost-Machine
   ```

2. Install dependencies:

   ```bash
   npm ci
   ```

3. Create your local environment file:

   ```bash
   cp .env.example .env.local
   ```

4. Add the configuration values described below, then start the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

On Windows PowerShell, create the environment file with:

```powershell
Copy-Item .env.example .env.local
```

## Environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth application client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth application client secret |
| `GITHUB_REDIRECT_URI` | Yes | Exact OAuth callback URL |
| `AUTH_SECRET` | Yes | Secret used to encrypt the session cookie |
| `OLLAMA_API_KEY` | For AI features | Server-side Ollama Cloud API key |
| `OLLAMA_MODEL` | No | Ollama Cloud model; defaults to `glm-5.3` |
| `DATABASE_URL` | No | Reserved for a future database-backed implementation |

Register this callback URL in your GitHub OAuth App:

```text
http://localhost:3000/api/auth/callback
```

For the deployed Render service, use:

```text
https://repopilot-9tal.onrender.com/api/auth/callback
```

Generate a strong session secret with:

```bash
openssl rand -base64 32
```

The OAuth integration requests `read:user` and `repo` scopes. GitHub's `repo` scope is broad; authorize only an account you trust. Keep all credentials in `.env.local` or your hosting provider's secret environment settings. Never commit real keys or tokens.

## Project structure

```text
Ghost-Machine/
├── .github/
│   └── workflows/
│       └── ci.yml                 # CI, build, smoke tests, dependency audit
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── ai/                # AI chat, summaries, repository organization
│   │   │   ├── auth/              # GitHub OAuth, callback, session, logout
│   │   │   ├── dashboard/         # Contribution and insight endpoints
│   │   │   └── repositories/      # Repository import and assessment
│   │   ├── activity/              # Activity route
│   │   ├── dashboard/             # Dashboard route
│   │   ├── priorities/            # Priority-filtered route
│   │   ├── repositories/           # Repository route
│   │   ├── settings/               # Settings route
│   │   ├── work-board/             # In-progress route
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                # Login / entry route
│   ├── components/
│   │   ├── login-page.tsx
│   │   ├── repo-pilot-dashboard.tsx
│   │   └── workspace-route.tsx
│   ├── lib/
│   │   └── github-session.ts       # Encrypted session handling
│   └── types/
│       └── repository.ts
├── .env.example
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── package-lock.json
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── LICENSE
└── README.md
```

The route page files intentionally remain separate because Next.js uses them as URL entry points. Shared workspace authentication and rendering are centralized in `src/components/workspace-route.tsx`; the dashboard implementation lives in `src/components/repo-pilot-dashboard.tsx`.

## Scripts and checks

```bash
npm run dev        # Start local development
npm run typecheck  # Run TypeScript checks
npm run lint       # Run ESLint
npm run build      # Create a production build
npm run start      # Start the production server
npm audit          # Review dependency advisories
```

The GitHub Actions workflow installs the locked dependencies, runs type-checking, linting and a production build, smoke-tests the production server and key security headers, then audits dependencies for high or critical vulnerabilities.

## Deployment

The project is configured for a Node.js deployment such as Render. Set the environment variables in the hosting dashboard, use `npm ci` for installation and `npm run build` for the build command. Start the app with `npm run start`. The production OAuth callback must exactly match the value registered in the GitHub OAuth App.

## Data handling and limitations

- Without authentication, repository discovery is limited to public repositories.
- After GitHub OAuth, the app can read repository metadata available to the authorized account.
- Project statuses and selected workspace preferences are stored in browser local storage; they are not synchronized across devices.
- Repository assessments are heuristic indicators based on available GitHub metadata. They are not definitive judgments about project health.
- AI features transmit the supported repository context to Ollama Cloud. Do not enable AI analysis for repositories whose metadata or activity must not be sent to that service.
- A repository being inactive does not prove it is abandoned or complete. Review evidence and make status decisions yourself.
- PostgreSQL-backed synchronization and semantic search are not implemented yet.

## License

See [LICENSE](LICENSE).
