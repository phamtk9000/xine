"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import { findFilmsAction, type FinderState } from "@/app/actions/find";
import type { Archetype, PickCard } from "@/lib/agent/finder";
import { Poster } from "@/components/poster";
import { Button, Notice, Textarea, formatRuntime } from "@/components/ui";
import { CONSTRAINTS, STARTERS, constraintClause } from "@/lib/agent/prompts";

const ARCHETYPE: Record<Archetype, { label: string; note: string }> = {
  safe: { label: "Safe bet", note: "Squarely inside your taste" },
  adjacent: { label: "Adjacent", note: "A step outside, should still land" },
  wildcard: { label: "Wildcard", note: "Looks wrong, shares something deeper" },
};

export function Finder() {
  const [state, action, pending] = useActionState<FinderState, FormData>(
    findFilmsAction,
    { status: "idle" },
  );

  const [message, setMessage] = useState("");
  const [constraints, setConstraints] = useState<string[]>([]);

  const started = state.status === "done" || state.status === "error";
  const turns = state.status === "idle" ? [] : state.turns;

  function applyStarter(prompt: string) {
    const clause = constraintClause(constraints);
    setMessage(clause ? `${prompt} ${clause}` : prompt);
  }

  function toggleConstraint(key: string) {
    setConstraints((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  return (
    <div>
      {!started && (
        <div className="mb-12">
          <p className="label">Start from one of these, or just type</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {STARTERS.map((starter) => (
              <button
                key={starter.key}
                type="button"
                onClick={() => applyStarter(starter.prompt)}
                className="rounded-[4px] border border-line p-5 text-left transition-colors hover:border-line-bright"
              >
                <span className="block font-display text-2xl leading-tight">
                  {starter.label}
                </span>
                <span className="mt-1.5 block text-xs leading-relaxed text-muted">
                  {starter.aside}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-8">
            <p className="label">Add a constraint</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {CONSTRAINTS.map((option) => {
                const on = constraints.includes(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => toggleConstraint(option.key)}
                    aria-pressed={on}
                    className={`rounded-[3px] border px-4 py-1.5 text-xs transition-colors ${
                      on
                        ? "border-gold text-gold"
                        : "border-line text-muted hover:border-line-bright hover:text-paper"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {turns.length > 0 && (
        <ol className="mb-10 space-y-4">
          {turns
            .filter((turn) => turn.role === "user")
            .map((turn, i) => (
              <li key={i} className="border-l-2 border-line-bright pl-5">
                <p className="label">You said</p>
                <p className="mt-1.5 text-sm leading-relaxed text-paper">
                  {turn.text}
                </p>
              </li>
            ))}
        </ol>
      )}

      {state.status === "done" && <Results state={state} />}

      {state.status === "error" && (
        <div className="mb-8">
          <Notice tone="error">{state.message}</Notice>
        </div>
      )}

      <form action={action} className={started ? "mt-12" : ""}>
        <input type="hidden" name="turns" value={JSON.stringify(turns)} />

        <Textarea
          name="message"
          rows={started ? 3 : 4}
          required
          minLength={3}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            started
              ? "Seen one already? Didn't land? Say why and it'll narrow again."
              : "Describe what you want the film to do — a mood, a reference film, a constraint."
          }
        />

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={pending || message.trim().length < 3}>
            {pending
              ? "Working through the catalogue…"
              : started
                ? "Narrow it →"
                : "Find me a film →"}
          </Button>
          {pending && (
            <span className="text-xs text-faint">
              Deconstructing, researching, then shortlisting. A few seconds.
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function Results({
  state,
}: {
  state: Extract<FinderState, { status: "done" }>;
}) {
  if (state.kind === "question") {
    return (
      <section className="rounded-[4px] border border-gold/40 bg-ink-raised p-8">
        <p className="label !text-gold">One thing first</p>
        <p className="mt-3 font-display text-3xl leading-tight">
          {state.question}
        </p>
      </section>
    );
  }

  return (
    <section>
      {!state.configured && (
        <div className="mb-8">
          <Notice>
            Running without a model key, so these are matched on the
            catalogue&rsquo;s structured data rather than reasoned about. Add an
            ANTHROPIC_API_KEY for rationales and reference films.
          </Notice>
        </div>
      )}

      {state.intro && (
        <p className="max-w-2xl text-base leading-relaxed text-paper/90">
          {state.intro}
        </p>
      )}

      {state.picks.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          Nothing earns a recommendation for that. Try coming at it from a
          different angle.
        </p>
      ) : (
        <>
          <ol className="mt-10 space-y-12">
            {state.picks.map((pick) => (
              <li
                key={pick.id}
                className="border-b border-line pb-12 last:border-0"
              >
                <PickBody pick={pick} showMatch={state.configured} />
              </li>
            ))}
          </ol>

          {state.finalPick &&
            (() => {
              const film = state.picks.find(
                (p) => p.id === state.finalPick?.id,
              );
              if (!film) return null;
              return (
                <div className="mt-12 rounded-[4px] border border-gold/40 bg-ink-raised p-8">
                  <p className="label !text-gold">If I had to pick only one</p>
                  <p className="mt-3 font-display text-4xl leading-none uppercase">
                    {film.title}
                  </p>
                  <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
                    {state.finalPick.reason}
                  </p>
                </div>
              );
            })()}
        </>
      )}

      {state.configured && state.toolCalls > 0 && (
        <p className="mt-10 font-sans text-[0.625rem] tracking-[0.16em] uppercase text-faint">
          {state.toolCalls} {state.toolCalls === 1 ? "query" : "queries"} run
          {state.externalEnabled ? " across XINE and TMDB" : " across XINE"}
        </p>
      )}
    </section>
  );
}

function PickBody({ pick, showMatch }: { pick: PickCard; showMatch: boolean }) {
  const runtime = formatRuntime(pick.runtime);

  const title = (
    <>
      {pick.title}
      {pick.year && <span className="text-muted"> ({pick.year})</span>}
    </>
  );

  return (
    <>
      <div className="flex gap-6">
        <div className="w-24 shrink-0 sm:w-32">
          {pick.slug ? (
            <Link href={`/films/${pick.slug}`}>
              <PickPoster pick={pick} />
            </Link>
          ) : (
            <PickPoster pick={pick} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <p className="label !text-gold">
              {ARCHETYPE[pick.archetype].label}
            </p>
            <p className="text-xs text-faint">
              {ARCHETYPE[pick.archetype].note}
            </p>
          </div>

          <h3 className="mt-2 font-display text-4xl leading-[0.95] uppercase">
            {pick.slug ? (
              <Link
                href={`/films/${pick.slug}`}
                className="transition-colors hover:text-gold"
              >
                {title}
              </Link>
            ) : (
              title
            )}
          </h3>

          <p className="mt-2 text-xs text-faint">
            {[pick.director, runtime].filter(Boolean).join(" · ")}
          </p>

          {!pick.inCatalogue && (
            <p className="mt-3 inline-block rounded-[3px] border border-line px-3 py-1 text-[0.625rem] font-sans uppercase tracking-[0.16em] text-muted">
              Not in the XINE catalogue
            </p>
          )}

          {showMatch && (
            <div className="mt-5 flex items-center gap-4">
              <span className="label shrink-0">XINE Match</span>
              <span className="h-px flex-1 bg-line">
                <span
                  className="block h-px bg-gold"
                  style={{ width: `${pick.matchScore}%` }}
                />
              </span>
              <span className="font-sans text-sm text-gold tabular-nums">
                {pick.matchScore}%
              </span>
            </div>
          )}
        </div>
      </div>

      {pick.vibeCheck.length > 0 && (
        <div className="mt-6">
          <p className="label">The vibe check</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {pick.vibeCheck.map((item) => (
              <li
                key={item}
                className="rounded-[3px] border border-line px-3 py-1 text-xs text-muted"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 max-w-2xl">
        <p className="label">Why this fits your request</p>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-paper/90">
          {pick.whyItFits}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-x-10 gap-y-3">
        <div>
          <p className="label">Where to watch</p>
          <p className="mt-1.5 text-sm text-paper">
            {pick.providers.length > 0 ? (
              <>
                {pick.providers.join(", ")}
                <span className="ml-2 text-xs text-faint">
                  {pick.providerRegion}
                </span>
              </>
            ) : (
              <span className="text-faint">Not known</span>
            )}
          </p>
        </div>

        {runtime && (
          <div>
            <p className="label">Runtime</p>
            <p className="mt-1.5 text-sm text-paper">{runtime}</p>
          </div>
        )}

        {pick.communityScore !== null && (
          <div>
            <p className="label">XINE community</p>
            <p className="mt-1.5 font-sans text-sm text-paper tabular-nums">
              {pick.communityScore.toFixed(1)}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

/** TMDB picks carry a real poster; catalogue picks fall back to a type plate. */
function PickPoster({ pick }: { pick: PickCard }) {
  if (!pick.inCatalogue && pick.posterUrl) {
    return (
      <div className="relative aspect-2/3 overflow-hidden rounded-[3px] bg-ink-raised">
        <Image
          src={pick.posterUrl}
          alt={`${pick.title} poster`}
          fill
          sizes="128px"
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <Poster
      film={{
        slug: pick.slug ?? pick.id,
        title: pick.title,
        year: pick.year ?? 0,
        director: pick.director ?? "",
        posterUrl: pick.posterUrl,
      }}
      sizes="128px"
    />
  );
}
