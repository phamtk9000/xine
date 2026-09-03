# xine

An editorial film magazine, a rating system that asks six questions instead of
one (five axes plus an overall),
and a workspace that takes a film from a one-line idea to a pitch package.

Next.js 16 (App Router) · React 19 · Tailwind v4 · Prisma 7 on SQLite.

## Run it

```bash
cp .env.example .env
npm install
npm run db:reset   # creates dev.db and seeds films, members, lists, a project
npm run dev
```

`.env` is gitignored — real keys go there. Everything runs without any of the
optional keys; the features that need one say so in the interface.

Then sign in as `huy@xine.test` with the password `xine1234` to see a populated
profile, a taste breakdown and a project mid-development. All four seeded
accounts (`huy`, `mai`, `kovacs`, `dan`) use the same password.

## The five sections

| Route | What it is |
| --- | --- |
| `/films` | Catalogue with facets, film pages, five-axis ratings, reviews, watchlist |
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

## The film finder — architecture

```
[ user input ]
      │
      ▼
[ deconstruct ]   mood, pacing, aesthetic, hard constraints, implicit taste
      │
      ▼
[ research ]      XINE catalogue (deep)  +  TMDB (broad)
      │
      ▼
[ select ]        ~10–20 candidates → 3 picks, one per archetype
      │
      ▼
[ synthesise ]    XINE Match, vibe check, rationale, availability
```

All four stages run in one Claude loop rather than as separate services — the
research step is tool calls, not a second model. A separate profiler pass would
cost a round trip and lose the signal that only shows up once you see what the
catalogue actually holds.

**Two sources, different jobs.** The catalogue is 31 films with six rating
axes, community scores and our own synopses — and a page on the site. TMDB is
every film ever released with no editorial data. The agent gets both, is told
which is which, and marks anything outside the catalogue as such rather than
implying XINE data behind it. Streaming availability comes from TMDB for the
region in `TMDB_WATCH_REGION`, and is reported as unknown when the data is
absent — never guessed.

**Not a vector database.** Over 31 films, embeddings would be slower and less
precise than the SQL they replaced. Worth revisiting at a few thousand titles.

## The film finder

`/films/find` takes a description of a mood rather than a title. Put an
`ANTHROPIC_API_KEY` in `.env` and it runs a short agentic loop: the model
queries the catalogue through tools until it has enough to answer, then calls a
`recommend` tool with its picks.

The tools are in `lib/agent/catalogue.ts` — ordinary Prisma queries, no model
awareness — and the loop is `lib/agent/finder.ts`. Three things make it behave:

- **It can only recommend what it found.** Picks are validated against the
  slugs the tools actually returned, so a hallucinated title is dropped rather
  than rendered as a dead link.
- **The final answer is a tool call, not parsed prose.** The `recommend` tool's
  schema does the structuring, which leaves the model's own text free to be a
  normal paragraph.
- **The axes are the point.** "Looks extraordinary, don't care about the plot"
  is a Visual query, and `rank_by_axis` answers it directly. That question has
  no answer on a five-star site — it is the clearest argument for the whole
  rating model.

Without a key the page falls back to keyword search over the same functions and
labels itself as such.

## Film data

The seeded catalogue is enough to run everything. To pull real metadata and
poster art, put a TMDB key in `.env` and run:

```bash
npm run films:sync
```

Editorial fields — our synopses and critic scores — are never overwritten.

`npm run films:trending` pulls the week's trending titles from TMDB so the
homepage row has catalogue pages to link to. The row itself reads TMDB live
(`lib/trending.ts`) and falls back to the catalogue's own rating-volume sort
when TMDB is unreachable or unconfigured, so it degrades to what it used to be
rather than to nothing. The daily cron in `app/api/cron/refresh` runs the same
sync as its first job.

## Profiles

`/settings` edits the signed-in member's display name, bio, location and
picture; `/community/[username]` is the public read of it.

Avatars are stored inline on the row as a data URI rather than in an object
store. The browser crops the image square, scales it to 256px and re-encodes
it as WebP before it is submitted (`components/profile-form.tsx`), which
turns a phone photograph into roughly ten kilobytes; the server re-checks the
format and refuses anything over 96KB, because the column is read on every
page that lists members. Nobody has to upload anything — a member with no
picture gets a plate generated from their username in the same cold hue band
as the film type plates.

## Recommendations

`/for-you` reads what a member rates highest and follows the editorial lists
outward from it. Nothing is trained: forty-one ratings across four accounts
is not a matrix anybody can factorise, and a model fitted to it would produce
noise with a confident face.

Two layers. The lists come first — seventy-two arguments in which a person
placed eight films next to each other and said why, which is a similarity
graph with its edges labelled. But only 351 of 1,797 titles are in a list, so
the rest of the catalogue is reached by what every row carries: genre,
country, decade, and the people — director, cinematographer, composer, and
billed cast through the credits table. Shared attributes are weighted by how
rare they are, which is the whole trick: two films sharing "Drama" (1,145 of
them) means nothing, two sharing a cinematographer means a great deal. It is
what produces *Shot by John Alcott, like The Shining* → A Clockwork Orange.

Every recommendation explains itself with a fact rather than generated
prose, and a quality prior only breaks ties.

Several rules keep it honest, and all of them came from reading bad output
rather than from theory:

- Hub films are damped at `listCount ^ 0.35` — a square root rewarded
  obscurity so hard that Playtime outranked Her.
- Affinities are normalised per dimension, or they grow with the number of
  ratings until "English" outweighs everything specific.
- Language was removed entirely: 1,120 of 1,797 titles are English, and it
  is collinear with country, which says more.
- Nothing is recommended without one reason clearing `MIN_TOP` on its own.
  "A drama, in English, from the 2010s" is three true statements that
  together say nothing, and it put The Godfather in front of a reader whose
  favourite film is In the Mood for Love.
- A performer counts only as a lead or across two loved films — one shared
  fourth-billed actor recommended Guardians of the Galaxy.
- At most two films per director, per source list, and per crew member; and
  the lists may take only 55% of the page, or they take all of it and the
  other 1,446 titles stay invisible.

Members with nothing rated get the films xine has written about, and a line
saying the page rebuilds itself once they rate. `/films/find` remains the
other half: that one is the LLM programmer answering a described mood, this
one runs for free on every visit.

## Community

Members can follow each other (`Follow`, one row per direction — following is
a reading choice, not a relationship, and the interesting follows are rarely
reciprocated). `/community` then reads either everyone or only the people you
follow.

Ratings can be left anywhere a film appears: the catalogue grid and list rows
carry a ten-step scale that writes `overall` alone, since that is the valid
minimum the model was built around. The axis breakdown stays on the film
page — offering both in a grid would turn a one-tap control into a form.

`ListEntry.note` is finally writable: the owner of a list edits a line per
film in place, which is what separates a list that argues from one that
enumerates.

The monthly dossier now has two addresses. `/taste` is the private read with
month navigation; `/community/[username]/[month]` is the same reading at a
URL somebody can send. Nothing new becomes public there — watched films,
ratings and reviews are already on the profile it hangs off.

## Genres

One vocabulary, eighteen labels, in `lib/genres.ts`. TMDB films and TMDB
series use different genre id spaces with different names — "Science Fiction"
against "Sci-Fi & Fantasy", "Action" against "Action & Adventure" — and the
hand-written editorial films had a few labels of their own on top. Left
alone that is not just untidy: this site rates films and series alike, so
filtering by Science Fiction was silently hiding a hundred and eighty series
that are science fiction.

Every label now resolves to a house genre where titles are read out of TMDB
(`lib/tmdb.ts`) and where the editorial films are seeded, so imports cannot
grow the list again. To fix a catalogue imported by an older build:

```bash
npm run genres:normalise            # --dry-run to see what would change
```

## The release calendar

`/calendar` is a month grid: seven columns, one cell per day, poster chips in
the days that have something, today marked, arrows stepping month to month
with the count of what is behind each one. A schedule of every month stacked
was honest and hard to follow — "what is out this weekend" meant parsing a
hundred and thirty rows — where a grid answers it by shape. The list survives
as the phone layout (seven columns at 375px is unusable) and as a view
toggle. The page only reads — titles get into the catalogue through:

```bash
npm run films:upcoming                  # nine months ahead
npm run films:upcoming -- --months 12   # further out
```

Two different things are merged. A film or a brand new series has a *release
date*; a running series has a *next season*, which is not a release at all as
far as the model is concerned and is the thing people are actually waiting
for — nobody counts down to a show they have never heard of. Returning
seasons come from TMDB's `next_episode_to_air`:

```bash
npm run series:seasons              # every series in the catalogue
npm run series:seasons -- --limit 100
```

Signed in, the calendar also opens with what is landing off your own
watchlist this month, marks those rows, and offers them as a filter.

The whole year stays filled by the daily cron, which runs two passes: the
next two months, where dates actually move, and one further month chosen by
the date, which walks the rest of the horizon roughly twice a month. The
popularity floor relaxes with distance — February 2027 has 107 titles on
TMDB and exactly one above the near-term bar, so holding that bar out there
would filter everything rather than filter noise.

Discover is queried by popularity inside a date window rather than by date:
there are three thousand films dated in the next nine months, and sorted by
date the first hundred are regional uploads nobody is waiting for. The
calendar sorts them back into date order itself. Unreleased titles are also
the one case where the importer accepts a missing runtime and director — a
film that has not been cut yet has neither — provided it has a date and a
poster. The daily cron refreshes the calendar too, because dates move.

## Lists and collections

Editorial lists are grouped into ten collections — `power-wealth-ambition`,
`crime`, `psychological` and so on — named in `lib/collections.ts` and joined
by the `collection` column on `FilmList`. `/lists` is the hub,
`/collections/[slug]` is one shelf, `/lists/[slug]` is one list.

The seventy-two lists and the 344 titles they cite live in
`prisma/seed-data/collections.ts` and are built by:

```bash
npm run lists:seed              # resolve every title, then write the lists
npm run lists:seed -- --dry-run # resolve only; report what is missing
```

Titles are referenced by name, with a year and a kind, because most of them
are not in the catalogue to begin with — the seeder matches each against the
catalogue first and pulls the rest from TMDB. The year is load-bearing:
Solaris, Suspiria, Scarface and Cape Fear all name more than one real film,
and TMDB's search ranks by popularity. A handful of names beat scoring
outright and carry a pinned `tmdbId` instead; see the note on `SeedTitle`.

Re-running is safe: lists are upserted on their slug and their entries are
rebuilt in order. `db:reset` deliberately leaves them alone, since rebuilding
them costs several minutes of TMDB calls.

## Design

Cold instrument. The ground and the type sit on the blue side of neutral, so
the artwork is the only warm thing on any page and the interface around it
reads as instrumentation: hairlines, corner ticks, squared controls, tabular
readouts, and no glow anywhere. Tokens live at the top of `app/globals.css`.
Committed to a single dark theme rather than following the system — a film site
is a projection surface, and every poster and plate assumes it sits on ink.

Oxblood (`--color-accent`) is the CTA and the brand, and stays warm on purpose:
it is the one thing that should stop the eye on a cold ground. Steel cyan
(`--color-signal`) is every number — scores, axis bars, focus rings. The utility
name is still `gold` for now, so `text-gold` across the app keeps meaning "the
number colour"; only the value changed.

Two utilities carry most of the register: `readout` (mono, tabular) for any
number the interface reports, and `ticked` for corner marks on a panel.

The ambient wash is not fixed. `components/image-shade.tsx` samples whatever
artwork is on the page — a film's backdrop, the masthead's current plate, a
shelf's opening poster — and sets `--shade`, which the body gradients and
both band utilities read. Journal articles skip the sampling and hand over
the `accent` their frontmatter already declares, because a colour a person
chose beats one inferred from pixels. Pages with no artwork (the catalogue,
the calendar, community, settings) keep the house hues through the fallback
in each `var()`.

Sampling weights by saturation and drops near-black and near-white pixels
first: the straight average of a film still is mud, because every frame
averages to brown.

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
| `npm run films:trending` | Pull this week's TMDB trending titles into the catalogue |
| `npm run films:upcoming` | Fill the release calendar from TMDB |
| `npm run series:seasons` | Ask TMDB when running series come back |
| `npm run lists:seed` | Build the ten editorial collections and their 72 lists |
| `npm run genres:normalise` | Rewrite stored genres through the house vocabulary |
| `npm run media:sync` | Copy artwork into `public/media` |
