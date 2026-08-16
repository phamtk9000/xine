import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
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
  films: string[];
  score?: number;
  verdict?: VerdictRow[];
  featured?: boolean;
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

  // Wide tables have to scroll inside their own box, or the whole article
  // scrolls sideways on a phone.
  return String(file).replace(
    /<table>([\s\S]*?)<\/table>/g,
    '<div class="table-scroll"><table>$1</table></div>',
  );
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
        const raw = await readFile(path.join(DIR, file), "utf8");
        const { data, content } = matter(raw);
        return toMeta(file.replace(/\.md$/, ""), data, content);
      }),
  );

  return articles.sort((a, b) => b.date.localeCompare(a.date));
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
