import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { imageSize } from "@/lib/image-size";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";

/**
 * Editorial lives in content/journal as markdown, not in the database.
 * Articles are written, reviewed and versioned like code; putting them behind
 * a CMS would buy nothing at this size and cost the git history.
 */

const DIR = path.join(process.cwd(), "content", "journal");

export type VerdictRow = {
  department: string;
  rating: string;
  note: string;
};

/**
 * The four editorial art directions. Each one is a full page treatment —
 * typography, figure handling, rules and accent — not a colour swap. An
 * article picks the one that suits its argument.
 */
export const STYLES = ["noir", "zine", "dossier", "modernist"] as const;
export type EditorialStyle = (typeof STYLES)[number];

export const STYLE_LABELS: Record<EditorialStyle, string> = {
  noir: "Neo-noir graphic",
  zine: "Punk cinema zine",
  dossier: "Case file",
  modernist: "Modernist journal",
};

export type ArticleMeta = {
  slug: string;
  title: string;
  dek: string;
  kicker: string;
  author: string;
  date: string;
  readingTime: number;
  hero?: string;
  heroAlt?: string;
  heroCredit?: string;
  /**
   * "wide" crops the hero to a cinematic band — right for a banner. "plate"
   * contains it instead, for portrait or squarish key art that a wide crop
   * would decapitate.
   */
  heroLayout?: "wide" | "plate";
  films: string[];
  score?: number;
  verdict?: VerdictRow[];
  featured?: boolean;
  style: EditorialStyle;
  accent: string | null;
};

export type Article = ArticleMeta & { html: string };

/** Categories double as the Journal's top-level filter. */
export const KICKERS = [
  "Review",
  "Essay",
  "Analysis",
  "Craft",
  "Interview",
  "Festival",
] as const;

function readingTime(markdown: string) {
  const words = markdown.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}

async function render(markdown: string) {
  const file = await remark()
    .use(remarkGfm)
    // Articles carry hand-written <figure> blocks for artwork, so raw HTML has
    // to survive. Safe here because every source file is authored in-repo.
    .use(remarkHtml, { sanitize: false })
    .process(markdown);

  let html = String(file);

  // Wide tables have to scroll inside their own box, or the whole article
  // scrolls sideways on a phone.
  html = html.replace(
    /<table>([\s\S]*?)<\/table>/g,
    '<div class="table-scroll"><table>$1</table></div>',
  );

  return tagFigureOrientation(html);
}

/**
 * Tags each figure with the real orientation of its image.
 *
 * In the column layout a figure spans both columns, which is right for
 * landscape art and wrong for anything near square — a 1:1 image capped by
 * height fills barely half the band and leaves gutters either side. Reading
 * the actual dimensions lets the CSS span the wide ones and inset the tall
 * ones into a single column, the way a magazine runs a portrait plate beside
 * the text rather than across it.
 */
async function tagFigureOrientation(html: string) {
  const sources = [...html.matchAll(/<figure>\s*<img src="([^"]+)"/g)];

  for (const [, src] of sources) {
    const size = await imageSize(src);
    if (!size) continue;
    const ratio = size.width / size.height;
    // The band is ~1336px and figures cap at 72vh, so an image needs a ratio
    // near 1.85 to actually fill it. Anything squarer leaves gutters and is
    // better off inset into a single column.
    const orient = ratio >= 1.7 ? "wide" : "upright";
    html = html.replace(
      `<figure>\n<img src="${src}"`,
      `<figure data-orient="${orient}">\n<img src="${src}"`,
    );
    // remark-html may not emit the newline; cover both shapes.
    html = html.replace(
      `<figure>\n  <img src="${src}"`,
      `<figure data-orient="${orient}">\n  <img src="${src}"`,
    );
    html = html.replace(
      `<figure><img src="${src}"`,
      `<figure data-orient="${orient}"><img src="${src}"`,
    );
  }

  return html;
}

function toMeta(slug: string, data: Record<string, unknown>, body: string): ArticleMeta {
  return {
    slug,
    title: String(data.title ?? slug),
    dek: String(data.dek ?? ""),
    kicker: String(data.kicker ?? "Essay"),
    author: String(data.author ?? "xine"),
    date: String(data.date ?? ""),
    readingTime: readingTime(body),
    hero: data.hero ? String(data.hero) : undefined,
    heroAlt: data.heroAlt ? String(data.heroAlt) : undefined,
    heroCredit: data.heroCredit ? String(data.heroCredit) : undefined,
    heroLayout: data.heroLayout === "plate" ? "plate" : "wide",
    style: STYLES.includes(data.style as EditorialStyle)
      ? (data.style as EditorialStyle)
      : "noir",
    // One film-specific accent, per the art direction. Falls back to the
    // house oxblood when a piece doesn't name one.
    accent: typeof data.accent === "string" ? data.accent : null,
    films: Array.isArray(data.films) ? data.films.map(String) : [],
    score: typeof data.score === "number" ? data.score : undefined,
    verdict: Array.isArray(data.verdict)
      ? (data.verdict as VerdictRow[])
      : undefined,
    featured: data.featured === true,
  };
}

export async function listArticles(): Promise<ArticleMeta[]> {
  let files: string[];
  try {
    files = await readdir(DIR);
  } catch {
    return [];
  }

  const articles = await Promise.all(
    files
      .filter((f) => f.endsWith(".md"))
      .map(async (file) => {
        const slug = file.replace(/\.md$/, "");
        try {
          const raw = await readFile(path.join(DIR, file), "utf8");
          const { data, content } = matter(raw);
          return toMeta(slug, data, content);
        } catch (error) {
          // Malformed frontmatter in one file must not take down the whole
          // Journal — and at build time, the whole build. Skip it loudly.
          console.warn(
            `[journal] skipping ${file}: ${(error as Error).message.split("\n")[0]}`,
          );
          return null;
        }
      }),
  );

  return articles
    .filter((a): a is ArticleMeta => a !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function getArticle(slug: string): Promise<Article | null> {
  try {
    const raw = await readFile(path.join(DIR, `${slug}.md`), "utf8");
    const { data, content } = matter(raw);
    return { ...toMeta(slug, data, content), html: await render(content) };
  } catch {
    return null;
  }
}

/** Articles that reference a given film, for the film page's Journal rail. */
export async function articlesForFilm(filmSlug: string) {
  const all = await listArticles();
  return all.filter((a) => a.films.includes(filmSlug));
}
