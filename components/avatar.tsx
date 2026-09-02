/**
 * A member's picture, or the plate that stands in for one.
 *
 * The fallback is generated from the username rather than being a grey
 * silhouette: the same hue every time, so somebody is recognisable in an
 * activity feed before their name is read, and squared with a hairline like
 * the rest of the chrome rather than the usual circle. Nobody is obliged to
 * upload anything for the interface to look finished.
 *
 * Deliberately a plain <img> and not next/image: an avatar is a data URI
 * (see the note on User.avatar), and the optimiser has nothing to do with a
 * 256px image that is already inline in the payload.
 */

function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Two letters at most: initials from a display name, or the username. */
function initials(name: string, fallback: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  user,
  size = 48,
  className = "",
}: {
  user: { username: string; displayName: string; avatar?: string | null };
  /** Rendered pixel size. The image itself is always 256px square. */
  size?: number;
  className?: string;
}) {
  const box = `overflow-hidden rounded-[3px] border border-line ${className}`;

  if (user.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatar}
        alt=""
        width={size}
        height={size}
        className={`${box} object-cover`}
        style={{ width: size, height: size }}
      />
    );
  }

  // Same cold band as the poster plates, so a wall of members and a wall of
  // films belong to one palette.
  const hue = 190 + (hash(user.username) % 90);

  return (
    <span
      className={`flex items-center justify-center ${box}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(150deg, oklch(0.3 0.045 ${hue}), oklch(0.15 0.025 ${(hue + 30) % 360}))`,
      }}
      aria-hidden="true"
    >
      <span
        className="font-display leading-none text-paper/80"
        style={{ fontSize: Math.max(11, Math.round(size * 0.36)) }}
      >
        {initials(user.displayName, user.username)}
      </span>
    </span>
  );
}
