# Link Me In Article Dashboard

A GitHub Pages-deployable MVP dashboard for reviewing LinkedIn article candidates from Hermes cron scouts.

## What is included

- Article inbox seeded from past Hermes cron scout outputs.
- Filters by theme, status, search text and sort mode.
- Local review controls for status, stars and notes.
- Future LinkedIn article pile seeded from the current content plan.
- Post history seeded from the LinkedIn plan.
- Early stats/theme mix page.

## MVP limitation

Review actions currently live in browser state and can be exported as JSON. The next iteration should add GitHub Contents API write-back so decisions persist directly into `public/data/articles.json`.

## Development

```bash
npm install
npm run dev
npm run build
```

## Deployment

The repository deploys to GitHub Pages through `.github/workflows/deploy.yml`.
