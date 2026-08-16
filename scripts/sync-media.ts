import "dotenv/config";
import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Next only serves static files out of public/, so artwork kept elsewhere has
 * to be copied in. Drop images into MEDIA_SOURCE and run `npm run media:sync`;
 * the folder structure is preserved, so a file at
 *
 *   <source>/journal/anatomy-of-an-antihero/hero.png
 *
 * becomes /media/journal/anatomy-of-an-antihero/hero.png on the site.
 */
const SOURCE =
  process.env.MEDIA_SOURCE ?? path.join(process.env.HOME ?? "", "Documents/Xine/media");
const DEST = path.join(process.cwd(), "public", "media");

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".gif",
  ".svg",
  ".mp4",
  ".webm",
]);

async function walk(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full, base)));
    } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(path.relative(base, full));
    }
  }
  return files;
}

async function main() {
  if (!existsSync(SOURCE)) {
    console.error(
      `Media source not found: ${SOURCE}\n` +
        "Set MEDIA_SOURCE in .env to point at your image folder.",
    );
    process.exit(1);
  }

  const files = await walk(SOURCE);
  if (files.length === 0) {
    console.log(`No images found in ${SOURCE}`);
    return;
  }

  console.log(`Syncing ${files.length} files from ${SOURCE}…`);
  let copied = 0;
  let skipped = 0;

  for (const relative of files) {
    const from = path.join(SOURCE, relative);
    const to = path.join(DEST, relative);

    // Skip files that are already there and no older than the source, so a
    // repeated sync is cheap and does not churn the build cache.
    if (existsSync(to)) {
      const [src, dst] = await Promise.all([stat(from), stat(to)]);
      if (dst.mtimeMs >= src.mtimeMs) {
        skipped++;
        continue;
      }
    }

    await mkdir(path.dirname(to), { recursive: true });
    await cp(from, to);
    copied++;
    console.log(`  ✓ /media/${relative.split(path.sep).join("/")}`);
  }

  console.log(`\nCopied ${copied}, unchanged ${skipped}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
