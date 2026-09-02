"use client";

import { useActionState, useRef, useState } from "react";
import { updateProfile, type ProfileState } from "@/app/actions/profile";
import { Avatar } from "@/components/avatar";
import { Button, Field, Input, Notice, Textarea } from "@/components/ui";

/**
 * Editing your own profile.
 *
 * The picture is resized in the browser before it is ever sent: a canvas
 * crops it square, scales it to 256px and re-encodes it as WebP, which turns
 * a four-megabyte phone photograph into about twelve kilobytes. That is what
 * makes it viable to keep an avatar as a data URI in the row (see the note on
 * User.avatar) instead of standing up an object store for one small image
 * per member — and it means nothing is uploaded until the form is submitted.
 *
 * The server re-checks the format and the size regardless. This runs in the
 * browser, so it is a convenience, not a control.
 */

const AVATAR_PX = 256;
const QUALITY = 0.82;

async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);

  // Centre crop to a square first, so a portrait photograph is not squashed.
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PX;
  canvas.height = AVATAR_PX;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
  bitmap.close();

  // WebP where the browser has it, PNG where it does not — toDataURL falls
  // back to PNG silently, which the server accepts too.
  return canvas.toDataURL("image/webp", QUALITY);
}

export function ProfileForm({
  user,
}: {
  user: {
    username: string;
    displayName: string;
    bio: string | null;
    location: string | null;
    avatar: string | null;
  };
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(
    updateProfile,
    null,
  );

  // null = unchanged, "" = cleared, a data URI = a new picture.
  const [avatar, setAvatar] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const shown = avatar === "" ? null : (avatar ?? user.avatar);

  async function choose(file: File | undefined) {
    if (!file) return;
    setProblem(null);

    if (!file.type.startsWith("image/")) {
      setProblem("That file is not an image");
      return;
    }

    setReading(true);
    try {
      setAvatar(await shrink(file));
    } catch {
      setProblem("That image could not be read");
    } finally {
      setReading(false);
    }
  }

  return (
    <form action={action} className="space-y-8">
      <div>
        <p className="label">Picture</p>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <Avatar
            user={{
              username: user.username,
              displayName: user.displayName,
              avatar: shown,
            }}
            size={88}
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={reading}
              className="rounded-[3px] border border-line-bright px-4 py-2.5 font-sans text-[0.6875rem] tracking-[0.14em] uppercase transition-colors hover:border-paper disabled:opacity-50"
            >
              {reading ? "Reading…" : shown ? "Replace" : "Upload"}
            </button>

            {shown && (
              <button
                type="button"
                onClick={() => setAvatar("")}
                className="label transition-colors hover:text-accent"
              >
                Remove
              </button>
            )}

            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => choose(e.target.files?.[0])}
            />
          </div>
        </div>

        <p className="mt-3 max-w-md text-xs leading-relaxed text-faint">
          Cropped square and shrunk to {AVATAR_PX}px in your browser before it
          is sent. Leave it empty and your initials are drawn instead.
        </p>

        {/* The value the action reads: a data URI, the word "remove", or
            nothing at all when the picture was not touched. */}
        <input
          type="hidden"
          name="avatar"
          value={avatar === "" ? "remove" : (avatar ?? "")}
        />
      </div>

      <Field label="Display name">
        <Input
          name="displayName"
          defaultValue={user.displayName}
          required
          maxLength={60}
        />
      </Field>

      <Field label="Bio" hint="What you watch, and how you watch it.">
        <Textarea
          name="bio"
          rows={4}
          maxLength={400}
          defaultValue={user.bio ?? ""}
          placeholder="Programmer by day. Slow cinema apologist."
        />
      </Field>

      <Field label="Location" hint="Optional — a city is enough.">
        <Input
          name="location"
          defaultValue={user.location ?? ""}
          maxLength={80}
          placeholder="Hanoi"
        />
      </Field>

      {problem && <Notice tone="error">{problem}</Notice>}
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      {state?.ok && !state.error && <Notice>Saved.</Notice>}

      <Button type="submit" disabled={pending || reading}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
