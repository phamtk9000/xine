import type { Metadata } from "next";
import { Container } from "@/components/ui";
import { Finder } from "@/components/finder";
import { agentConfigured } from "@/lib/agent/finder";
import { AXES } from "@/lib/scores";

export const metadata: Metadata = {
  title: "Find me a film",
  description:
    "Describe a mood, a texture or a constraint and the finder searches the catalogue across six rating axes to answer it.",
};

export default function FindPage() {
  const configured = agentConfigured();

  return (
    <Container className="py-16">
      <div className="grid gap-14 lg:grid-cols-[1fr_18rem]">
        <div className="max-w-2xl">
          <p className="label !text-gold">Films</p>
          <h1 className="mt-4 font-display text-5xl leading-[0.95] tracking-tight sm:text-6xl">
            Describe it and we&rsquo;ll find it.
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted">
            Not a title search. Start from what you want the film to{" "}
            <em>do</em>, narrow it if you feel like it, and add your own words
            only if the options miss. It works through the catalogue from there
            until it has an answer.
          </p>

          <div className="mt-12">
            <Finder />
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="label border-b border-line pb-2">Why this works here</p>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Every film carries six numbers, not one. That turns a mood into a
            query: “looks extraordinary, plot doesn&rsquo;t matter” is a Visual
            search, and a five-star site has no way to answer it.
          </p>

          <ul className="mt-6 space-y-2">
            {AXES.map((axis) => (
              <li key={axis.key} className="text-sm text-paper">
                {axis.label}
              </li>
            ))}
          </ul>

          <p className="mt-8 border-t border-line pt-5 text-xs leading-relaxed text-faint">
            {configured
              ? "The finder queries the catalogue directly — it can only recommend films that are actually here, and it will say so when nothing fits."
              : "No model key configured, so this runs as a keyword search. Add ANTHROPIC_API_KEY to .env for the real thing."}
          </p>
        </aside>
      </div>
    </Container>
  );
}
