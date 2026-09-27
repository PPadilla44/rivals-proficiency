# Proficiency Board

Every Marvel Rivals hero's proficiency level on one screen. See who is closest to **Lord** (level 20) and **Champion** (level 50), search, sort and filter the whole roster, and get time estimates from the playtime in your match history.

## Features

- **All 54 heroes** (through Gorr the God Butcher, Season 10) with rank badges, progress to the next milestone, and levels to go
- **Search, sort and filter**: by role, by rank, by goal (near Lord, near Champion, untouched), sorted by level, closest to Lord or Champion, name, role or release order
- **Guest mode**: works without an account, saving levels in the browser. Sign in later and import them
- **Sign in** with Discord or Google to keep your board on every device
- **Playtime sync** through [MarvelRivalsAPI.com](https://marvelrivalsapi.com): link your in-game name or UID and the board estimates how many levels you gained since you last set each hero, plus hours to the next milestone
- **Learns your pace**: each time you correct a level after playing, it compares points earned to hours played and updates your points-per-hour

## How estimates work

The game does not expose proficiency through any API, so levels you type are the source of truth.

1. When you set a hero's level, the app records that hero's lifetime playtime as a baseline.
2. On sync, playtime since the baseline is converted to proficiency points at your pace (default 320 points per hour, which puts Lord at about 20 hours).
3. Points are spent through the per-level costs in `src/lib/proficiency.ts` (125 per level early on, 1,600 per level from Lord, 3,100 per level past Champion).
4. The estimate shows as `est. Lv N` with a **Use** button. Accepting an estimate never trains your pace; only levels you type do.

Playtime from the stats API covers matches it has seen. Arcade daily missions and challenge bonuses make real progress drift from time-only math, which is why typed corrections recalibrate.

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind CSS 4 · Postgres with Drizzle ORM · Auth.js v5 · Vitest

## Local setup

```bash
pnpm install
cp .env.example .env.local   # fill in the values
pnpm db:migrate              # create tables
pnpm dev
```

You need a Postgres database (a free [Neon](https://neon.tech) project works, or `docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`) and at least one sign-in provider. Without `MARVEL_RIVALS_API_KEY` everything except sync works.

OAuth redirect URLs:

- Discord: `http://localhost:3000/api/auth/callback/discord`
- Google: `http://localhost:3000/api/auth/callback/google`

## Deploy to Vercel

1. Import this repo in Vercel.
2. Add a Postgres database from the Vercel Marketplace (Neon) so `DATABASE_URL` is set.
3. Add `AUTH_SECRET` (`npx auth secret`), provider IDs and secrets, and `MARVEL_RIVALS_API_KEY`.
4. Add the production redirect URLs (`https://<your-domain>/api/auth/callback/<provider>`) to your OAuth apps.
5. Migrations run automatically at the start of every build (`scripts/migrate.mjs`), and are skipped when no database is configured.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm build` | Production build |
| `pnpm typecheck` | Route types plus `tsc` |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests and database tests (in-memory PGlite, no setup needed) |
| `pnpm db:generate` | Create a migration after editing `src/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations |

## Project layout

```
src/
  app/page.tsx          Board page (guest or signed in)
  app/actions.ts        Server actions: save levels, import, link, sync
  auth.ts               Auth.js config
  db/schema.ts          Auth tables plus player_link, hero_level, hero_playtime
  server/board.ts       Data access and rate learning
  lib/heroes.ts         Roster and API name matching
  lib/proficiency.ts    Ranks, point costs, estimator
  lib/rivals-api.ts     MarvelRivalsAPI client and response parser
  components/           Board, summary panels, hero rows, account bar
tests/                  Vitest suites
```

## Adding a new hero

Append a row to `ROSTER` in `src/lib/heroes.ts` (name, role, and any alternate spellings the stats API uses). Sync reports hero names it could not match, which is the signal to add one.

## Notes

- MarvelRivalsAPI.com is unofficial and may change. Its update endpoint allows one refresh request per player every 30 minutes; the app enforces a 5 minute sync cooldown on top of that.
- Players need a public career profile in game for sync to work.
- Fonts (Chakra Petch, IBM Plex Sans, IBM Plex Mono) are self-hosted under the SIL Open Font License.
- Not affiliated with NetEase Games or Marvel.
