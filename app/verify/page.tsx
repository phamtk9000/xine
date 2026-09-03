import Link from "next/link";
import type { Metadata } from "next";
import { ResendVerification } from "@/components/resend-verification";
import { ButtonLink, Container, Notice } from "@/components/ui";
import { consumeVerification } from "@/lib/verification";

export const metadata: Metadata = {
  title: "Confirm your email",
  robots: { index: false },
};

/**
 * Where a confirmation link lands, and where somebody waiting for one waits.
 *
 * One page rather than two, because the states are the same conversation:
 * with a token it is spending the link, without one it is offering another.
 * Every failure gets a specific sentence — used, expired, or never valid —
 * since "that didn't work" leaves the reader with nothing to do next, and
 * these three have different answers.
 */
export default async function VerifyPage({
  searchParams,
}: PageProps<"/verify">) {
  const { token } = await searchParams;
  const raw = typeof token === "string" ? token : null;

  if (!raw) {
    return (
      <Shell title="Check your inbox">
        <p className="mt-4 text-sm leading-relaxed text-muted">
          We sent a link to the address you signed up with. Open it and the
          account is yours — it works once, and expires in a day.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-faint">
          Nothing arrived? It may be in spam, or the address may have a typo in
          it. Ask for another below.
        </p>
        <ResendVerification />
      </Shell>
    );
  }

  const result = await consumeVerification(raw);

  if (result.ok) {
    return (
      <Shell title="Confirmed">
        <p className="mt-4 text-sm leading-relaxed text-muted">
          That address is yours. Sign in and the rest of the site opens up —
          ratings, lists, a watchlist, and a profile at{" "}
          <span className="font-mono text-paper">
            /community/{result.username}
          </span>
          .
        </p>
        <div className="mt-8">
          <ButtonLink href="/sign-in?next=/watch/start">Sign in</ButtonLink>
        </div>
        <p className="mt-4 text-xs text-faint">
          Sign in leads to a quick taste primer — five films you love, three
          you didn&rsquo;t connect with — so recommendations start from
          something other than the editorial average.
        </p>
      </Shell>
    );
  }

  const said = {
    used: "That link has already been used. If it was you, the account is confirmed — just sign in.",
    expired:
      "That link has expired. They last a day; here is a fresh one.",
    unknown:
      "That link is not one of ours, or it was replaced by a newer one.",
  }[result.reason];

  return (
    <Shell title={result.reason === "used" ? "Already done" : "That link didn't work"}>
      <div className="mt-6">
        <Notice tone={result.reason === "used" ? "info" : "error"}>{said}</Notice>
      </div>

      {result.reason === "used" ? (
        <div className="mt-8">
          <ButtonLink href="/sign-in">Sign in</ButtonLink>
        </div>
      ) : (
        <ResendVerification />
      )}
    </Shell>
  );
}

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Container className="py-20">
      <div className="mx-auto max-w-sm">
        <p className="label">Community</p>
        <h1 className="mt-4 font-display text-5xl leading-none">{title}</h1>
        {children}
        <p className="mt-10 text-sm text-muted">
          <Link href="/" className="text-gold underline underline-offset-4">
            Back to the site
          </Link>
        </p>
      </div>
    </Container>
  );
}
