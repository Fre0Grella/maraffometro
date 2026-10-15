# Maraffometro

Leaderboard, statistics and live scorekeeper for **Maraffa** (Beccaccino), the
Romagna card game, made for the friends who play it every lunch break.

- **Sign in with Google**, get a profile, customise it (name, symbol, colour, motto).
- **Score at the table**: seat the four players, say who has the 4 of denari,
  then for each hand tap the points of the team *di mano* (the other team gets
  the rest of the 11) and, if it happened, who had the **maraffa** (+3). Set
  lengths (31/41/51) are chosen as you go, so bo3s like 41-41-31 work naturally.
  The match lives on the phone until it's sent, and is retried if the wifi drops.
- **Ranking** that measures skill, not attendance: a Bayesian Bradley–Terry
  model over the whole history, aware of partners and opponents.
  See [docs/ranking.md](docs/ranking.md).
- **Statistics**: best and unluckiest partner, nemesis, maraffas made and
  suffered, average points *di mano* and *fuori mano*, form, history.
- **Guests**: seat a friend who hasn't signed in yet; they claim their history
  later with a code.

## Architecture

Same shape as FantasyWiki:

```
browser ──► Cloudflare Pages (Vue app + functions/ proxy) ──service binding──► Worker (Hono) ──► D1
```

| Folder | What |
| --- | --- |
| `frontend/` | Vue 3, Vite, Pinia, TanStack Query. `functions/` proxies `/api/*` and `/auth/google` to the Worker, so everything is same-origin and the session cookie is first-party. |
| `backend/` | Hono Worker: Google OAuth (`@hono/oauth-providers`), JWT session in an HttpOnly cookie, REST API under `/api/v1`, rating engine in `src/rating/`. D1 migrations in `migrations/`. |
| `shared/` | Game rules (hand scoring, when a set ends, who wins) and DTOs, used by both, so the tracker and the server never disagree on a score. |

## Run it locally

Needs Node 22+ and npm ≥ 11.19 (`npm i -g npm@latest`; npm 11.5 crashes on this tree).

```bash
npm ci
cp backend/.dev.vars.example backend/.dev.vars   # set JWT_SECRET to anything long
npm run db:init                                   # local D1 (SQLite under backend/.wrangler)
npm run dev:backend                               # Worker on :8787
npm run dev:frontend                              # app on http://localhost:5173
```

Without Google credentials, use **Accesso demo** on the sign-in page: it creates
a local player with the name you type (`/auth/dev` only exists in the local
Worker). To fill four seats, add guests from the player picker.

```bash
npm test          # rules, rating engine, API (against a real schema on node:sqlite), live tracker
npm run typecheck
```

## Deploy

Pushing to `main` runs CI and, once set up, deploys D1 migrations → Worker → Pages.

**One-time setup** (needs [`gh`](https://cli.github.com) signed in):

1. **Cloudflare API token** (My Profile → API Tokens → Create custom token) with
   *Account* permissions: **D1 Edit**, **Workers Scripts Edit**, **Cloudflare
   Pages Edit**, **Account Settings Read**. Also note your **account id**.
2. **Google OAuth client** (Google Cloud console → APIs & Services → Credentials
   → OAuth client ID → Web application). Authorised redirect URIs:
   - `https://maraffometro.pages.dev/auth/google` (the script prints the exact
     one if Cloudflare assigns a different subdomain)
   - `http://localhost:5173/auth/google`
3. Run:
   ```bash
   bash scripts/setup-cloudflare.sh
   ```
   It creates the D1 database and the Pages project, writes their id/URL into
   `backend/wrangler.jsonc`, stores `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and a
   generated `JWT_SECRET` as GitHub secrets, enables deploys
   (`DEPLOY_ENABLED` variable), and offers to push.

## Rules as implemented

- A hand is worth 11 points (thirds dropped); a maraffa adds 3 to whoever held it.
- A set is checked at the end of every hand: a team that reached the target
  wins; if both did, the higher score wins; an exact tie plays another hand.
- The first hand is led by whoever has the 4 of denari; then the lead rotates.
  A following set carries on the rotation; a tie-break (sets level) asks for the
  4 of denari again. Both can be overridden at the table.
- A match is any number of sets. It can be stopped at any time: finished sets
  count, an unfinished one only feeds the statistics. Level sets = draw.
- Only someone seated can record a match; anyone seated (or the recorder) can void it.

## License

[AGPL-3.0](LICENSE).
