/**
 * The shape of the "what to watch" questions, and of a card.
 *
 * Split out of lib/watch because that module is server-only — it holds the
 * query — and the chips are a client component. A client file that imports
 * anything marked server-only does not fail with a message about it; the
 * route simply stops building, and Next reports a missing manifest for a
 * page that looks perfectly fine. Hence a module with no imports at all.
 */

export type Question = {
  key: "mood" | "length" | "era" | "place";
  prompt: string;
  options: { value: string; label: string; note?: string }[];
};

export const QUESTIONS: Question[] = [
  {
    key: "mood",
    prompt: "How should it feel?",
    options: [
      { value: "dark", label: "Dark", note: "Crime, thriller, horror" },
      { value: "tender", label: "Tender", note: "Romance and drama" },
      { value: "thrilling", label: "Thrilling", note: "Action and adventure" },
      { value: "beautiful", label: "Beautiful", note: "Made to be looked at" },
      { value: "funny", label: "Funny", note: "Comedy" },
      { value: "strange", label: "Strange", note: "Science fiction, fantasy, mystery" },
    ],
  },
  {
    key: "length",
    prompt: "How long have you got?",
    options: [
      { value: "short", label: "Under 100 minutes" },
      { value: "normal", label: "A normal evening", note: "100–140" },
      { value: "long", label: "All night", note: "140+" },
    ],
  },
  {
    key: "era",
    prompt: "How old?",
    options: [
      { value: "now", label: "Recent", note: "2015 onward" },
      { value: "modern", label: "Modern", note: "1990–2014" },
      { value: "classic", label: "Older", note: "Before 1990" },
    ],
  },
  {
    key: "place",
    prompt: "From where?",
    options: [
      { value: "anywhere", label: "Anywhere" },
      { value: "east-asia", label: "East Asia" },
      { value: "europe", label: "Europe" },
      { value: "americas", label: "The Americas" },
    ],
  },
];

export type Answers = Partial<Record<Question["key"], string>>;

export type WatchCard = {
  id: string;
  slug: string;
  title: string;
  year: number;
  director: string;
  runtime: number | null;
  country: string | null;
  genres: string[];
  synopsis: string;
  posterUrl: string | null;
  criticScore: number | null;
  tmdbScore: number | null;
  reviewed: boolean;
  /** Why it is in this deck, in the site's own terms. */
  note: string | null;
};

