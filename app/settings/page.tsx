import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink, Container, EmptyState, PageHeader } from "@/components/ui";
import { ProfileForm } from "@/components/profile-form";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Your profile" };

export default async function SettingsPage() {
  const session = await getCurrentUser();

  if (!session) {
    return (
      <Container className="py-20">
        <div className="mx-auto max-w-lg">
          <EmptyState
            title="Sign in first"
            body="Your profile is yours to edit once you are signed in."
            action={<ButtonLink href="/sign-in">Sign in</ButtonLink>}
          />
        </div>
      </Container>
    );
  }

  const user = await db.user.findUnique({
    where: { id: session.id },
    select: {
      username: true,
      displayName: true,
      bio: true,
      location: true,
      avatar: true,
    },
  });
  if (!user) return null;

  return (
    <>
      <PageHeader
        label="Your profile"
        title="How you appear."
        lede="Your name, your picture and a line about what you watch. Everything here is public — it is what other members see next to your ratings."
        action={
          <ButtonLink href={`/community/${user.username}`} variant="outline">
            View profile
          </ButtonLink>
        }
      />

      <Container className="py-14">
        <div className="max-w-xl">
          <ProfileForm user={user} />

          <p className="mt-10 border-t border-line pt-6 text-xs leading-relaxed text-faint">
            Your username (@{user.username}) and email are fixed for now — a
            username is in the URL of everything you have written, and moving
            it would break those links.{" "}
            <Link
              href={`/community/${user.username}`}
              className="text-gold underline underline-offset-4"
            >
              See how it reads
            </Link>
            .
          </p>
        </div>
      </Container>
    </>
  );
}
