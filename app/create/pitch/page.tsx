import type { Metadata } from "next";
import { ButtonLink, Container, EmptyState } from "@/components/ui";
import { PitchForm } from "@/components/pitch-form";
import { STAGES } from "@/lib/stages";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Pitch Your Film",
  description:
    "Start with one paragraph. The workspace takes it from idea to pitch package in ten stages.",
};

export default async function PitchPage() {
  const user = await getCurrentUser();

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-2xl">
        <p className="label !text-gold">Create</p>
        <h1 className="mt-4 font-display text-5xl leading-[0.95] tracking-tight sm:text-6xl">
          Pitch your film.
        </h1>
        <p className="mt-6 text-base leading-relaxed text-muted">
          Write the idea the way you would say it out loud. Nothing here is
          public, nothing is judged, and you can rewrite all of it later — the
          only thing that matters right now is getting it out of your head and
          into a document.
        </p>

        <div className="mt-12">
          {user ? (
            <PitchForm />
          ) : (
            <EmptyState
              title="Projects need an account"
              body="A project is yours — drafts, revisions and all ten stages. Sign in and the workspace opens on the next screen."
              action={<ButtonLink href="/sign-in">Sign in to start</ButtonLink>}
            />
          )}
        </div>

        <section className="mt-16 border-t border-line pt-10">
          <p className="label">What happens after you submit</p>
          <ol className="mt-6 flex flex-wrap gap-x-3 gap-y-2">
            {STAGES.map((stage, i) => (
              <li key={stage.key} className="flex items-center gap-3">
                <span
                  className={`text-sm ${i === 0 ? "text-gold" : "text-faint"}`}
                >
                  {stage.label}
                </span>
                {i < STAGES.length - 1 && (
                  <span className="text-faint" aria-hidden>
                    ↓
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Container>
  );
}
