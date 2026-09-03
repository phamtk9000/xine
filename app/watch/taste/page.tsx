import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import { storedTaste } from "@/lib/rec/taste";
import { TasteInspector } from "@/components/taste-inspector";

export const metadata: Metadata = {
  title: "Your taste",
  description: "What xine has inferred from what you rate, keep and refuse — open to inspect and correct.",
};

function topNames(tally: Record<string, number>, take = 6): string[] {
  return Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, take)
    .map(([name]) => name);
}

/**
 * The profile, laid open.
 *
 * Every other page that reads this data — the deck, the finalists, For
 * You — uses it silently, as an assumption behind a ranking. This is the one
 * place it is the subject rather than the mechanism: a reader can see what
 * has been inferred and take back anything that is wrong, which is the
 * difference between personalisation and a black box that happens to guess
 * well sometimes.
 */
export default async function TasteInspectorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/watch/taste");

  const taste = await storedTaste(user.id);

  return (
    <>
      <PageHeader
        label="Your taste"
        title="What xine thinks you like."
        lede="Built entirely from what you rate, keep and refuse — nothing here was ever asked for directly, which is exactly why it is worth checking. Anything wrong can be forgotten; the recommender starts learning that dimension over from nothing."
      />
      <Container className="py-14">
        <div className="max-w-2xl">
          <TasteInspector
            dims={taste?.dims ?? {}}
            affinities={{
              directors: topNames(taste?.affinities.directors ?? {}),
              countries: topNames(taste?.affinities.countries ?? {}),
              genres: topNames(taste?.affinities.genres ?? {}),
            }}
          />
        </div>
      </Container>
    </>
  );
}
