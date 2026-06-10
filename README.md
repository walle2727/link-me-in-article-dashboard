# Link Me In Article Dashboard

A static dashboard for reviewing LinkedIn article candidates from Hermes cron scouts.

## Current privacy model

This is still a static app, but the working data files under `public/data/` are now AES-GCM encrypted JSON envelopes. The browser asks for a passphrase and decrypts locally.

Important boundaries:

- The repo is private.
- The published static app can still be reachable depending on GitHub Pages plan/visibility settings.
- The dashboard data files are encrypted before publish, so direct downloads expose ciphertext, not article strategy content.
- The passphrase is not committed to the repo.
- Client-side auth is not real server authorization; this is a pragmatic first privacy layer before moving to Cloudflare Access/Vercel/backend auth.

## What is included

- Article inbox seeded from past Hermes cron scout outputs.
- Filters by theme, status, search text and sort mode.
- Review controls for status, stars and notes.
- GitHub Contents API write-back for encrypted article review persistence.
- Future LinkedIn article pile seeded from the current content plan.
- Drag-and-drop queue ordering with encrypted queue save.
- Draft-from-selected-queue-item flow.
- Post history seeded from the LinkedIn plan.
- Early stats/theme mix page.

## Development

```bash
npm install
npm run test
npm run build
npm run dev
```

## Data encryption

The static files are encrypted envelopes:

- `public/data/articles.json`
- `public/data/queue.json`
- `public/data/posts.json`

To append a structured candidate locally:

```bash
LINKMEIN_DATA_PASSPHRASE=... npm run append:candidate -- candidate.json
```

Candidate JSON requires at least a `title` and can include `url`, `source`, `summary`, `suggestedAngle`, `themes`, `agentScore`, and score fields.

## GitHub write-back from the browser

Use a fine-grained GitHub token at save time:

- Repository: `walle2727/link-me-in-article-dashboard`
- Permission: Contents read/write
- Scope: only this repository

The token is held in browser memory only and is not committed or stored by the app.

## Deployment

The repository deploys to GitHub Pages through `.github/workflows/deploy.yml`.
