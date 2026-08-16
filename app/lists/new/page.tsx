import type { Metadata } from "next";
import { Container, EmptyState, ButtonLink } from "@/components/ui";
import { NewListForm } from "@/components/new-list-form";
import { listFilms } from "@/lib/films";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Build a list" };

export default async function NewListPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Container className="py-20">
        <div className="mx-auto max-w-lg">
          <EmptyState
            title="Lists belong to people"
            body="Sign in to build a list. It gets your name on it, a page of its own, and a place on your profile."
            action={<ButtonLink href="/sign-in">Sign in</ButtonLink>}
          />
        </div>
      </Container>
    );
  }

  const films = await listFilms({ sort: "az", take: 300 });

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-2xl">
        <p className="label">Lists</p>
        <h1 className="mt-4 font-display text-5xl leading-none">
          Build a list
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted">
          A good list is an argument. Say what the films have in common in the
          description, then pick the ones that make the case.
        </p>

        <div className="mt-10">
          <NewListForm films={films} />
        </div>
      </div>
    </Container>
  );
}
