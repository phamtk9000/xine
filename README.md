# xine

An editorial film magazine, a rating system with six axes instead of five stars,
and a workspace that takes a film from a one-line idea to a pitch package.

Next.js 16 (App Router) · React 19 · Tailwind v4 · Prisma 7 on SQLite.

## Run it

```bash
npm install
npm run db:reset   # creates dev.db and seeds films, members, lists, a project
npm run dev
```

Then sign in as `huy@xine.test` with the password `xine1234` to see a populated
profile, a taste breakdown and a project mid-development. All four seeded
accounts (`huy`, `mai`, `kovacs`, `dan`) use the same password.

## The five sections

| Route | What it is |
| --- | --- |
| `/films` | Catalogue with facets, film pages, six-axis ratings, reviews, watchlist |
| `/journal` | Editorial — markdown in `content/journal`, not the database |
| `/lists` | Editorial and community collections |
| `/community` | Activity feed, members, profiles with derived taste profiles |
| `/create` | The ten-stage pipeline, project workspaces, Trailer Studio |
| `/develop` | The CONSULT layer — service tiers and enquiries, no account needed |

`Pitch Your Film →` in the header is the standing CTA into `/create/pitch`.

## The rating model

Six numbers, all 0–10: **Overall**, then **Story, Direction, Visual,
Performance, Sound**.

The five axes are optional. A rating with only `overall` is valid and is what
most people will leave — the one-tap path stays one tap, which is the thing
Letterboxd gets right and is easy to lose while chasing richer data. When
someone does open the breakdown, `overall` is derived from whichever axes they
filled in, unless they drag it themselves afterwards.

Averages ignore blank axes, so a film's Sound score reflects the people who
actually rated Sound. Profiles then surface which axis a person rewards most,
relative to their own average across the others — that lean is the interesting
signal, not the raw number. All of it is derived at read time (`lib/scores.ts`,
`lib/profile.ts`); nothing is denormalised, so nothing goes stale.

## Editorial

Articles are markdown files in `content/journal/` with frontmatter:

```yaml
title: The Anatomy of an Antihero
dek: One sentence that sells the piece.
kicker: Essay          # Review | Essay | Analysis | Craft | Interview | Festival
author: xine
date: "2026-08-16"
hero: /media/journal/anatomy-of-an-antihero/hero.png
films: [the-godfather] # slugs; cross-links the film pages both ways
score: 9.6             # reviews only — shown as the headline number
verdict:               # reviews only — the department breakdown table
  - department: Acting & performances
    rating: "10"
    note: …
```

Raw HTML survives rendering, so `<figure>` blocks with captions work inline.
Tables are wrapped in a scroll container automatically.

## Artwork

Next only serves static files from `public/`, so images kept elsewhere are
copied in:

```bash
npm run media:sync
```

This reads from `MEDIA_SOURCE` (default `~/Documents/Xine/media`) and mirrors
the folder structure into `public/media/`, skipping anything unchanged. A file
at `<source>/journal/my-piece/hero.png` becomes `/media/journal/my-piece/hero.png`.

No poster art ships with the repo. Films render as generated typographic
plates, deterministic from the slug, so the catalogue reads as a designed grid
rather than a wall of grey boxes.

## Film data

The seeded catalogue is enough to run everything. To pull real metadata and
poster art, put a TMDB key in `.env` and run:

```bash
npm run films:sync
```

Editorial fields — our synopses and critic scores — are never overwritten.

## Design

The palette comes from the key art: distressed screenprint on black, bone-cream
type, oxblood and ochre accents. Tokens live at the top of `app/globals.css`.
Committed to a single dark theme rather than following the system — a film site
is a projection surface, and every poster and plate assumes it sits on ink.

Oxblood (`--color-accent`) is the CTA and the brand. Ochre (`--color-gold`) is
every number: scores, axis bars, focus rings. Keeping those two jobs separate is
what stops the interface competing with the artwork.

## Moving off SQLite

Change the `datasource` provider in `prisma/schema.prisma` to `postgresql`,
swap the adapter in `lib/db.ts` for `@prisma/adapter-pg`, and point
`DATABASE_URL` at the new database. No model uses a SQLite-only feature; the
comma-packed columns are read through `lib/serialize.ts` and can stay as they
are or become real arrays.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` | `prisma generate` then a production build |
| `npm run db:reset` | Recreate and reseed the database |
| `npm run db:studio` | Prisma Studio |
| `npm run films:sync` | Enrich the catalogue from TMDB |
| `npm run media:sync` | Copy artwork into `public/media` |
