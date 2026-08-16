"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type AuthState } from "@/app/actions/auth";
import { Button, Container, Field, Input, Notice } from "@/components/ui";

export default function SignUpPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    signUp,
    null,
  );

  return (
    <Container className="py-20">
      <div className="mx-auto max-w-sm">
        <p className="label">Community</p>
        <h1 className="mt-4 font-display text-5xl leading-none">
          Create an account
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Ratings, reviews, lists and a taste profile that gets more interesting
          the more axes you fill in.
        </p>

        <form action={action} className="mt-10 space-y-5">
          <Field label="Name">
            <Input
              name="displayName"
              autoComplete="name"
              required
              placeholder="How your name appears"
            />
          </Field>
          <Field label="Username" hint="Your profile lives at /community/username">
            <Input
              name="username"
              autoComplete="username"
              required
              pattern="[A-Za-z0-9_]+"
              placeholder="huy"
            />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password" hint="At least 8 characters">
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </Field>

          {state?.error && <Notice tone="error">{state.error}</Notice>}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creating…" : "Create account"}
          </Button>
        </form>

        <p className="mt-8 text-sm text-muted">
          Already here?{" "}
          <Link href="/sign-in" className="text-gold underline underline-offset-4">
            Sign in
          </Link>
          .
        </p>
      </div>
    </Container>
  );
}
