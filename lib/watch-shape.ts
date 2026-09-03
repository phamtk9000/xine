/**
 * The questions, and the shape of a card.
 *
 * Client-safe by construction: the chips are a client component and cannot
 * import anything server-only. A client file that imports a server-only
 * module does not fail with a message saying so — the route stops building
 * and Next reports a missing manifest for a page that looks perfectly fine.
 *
 * The questions are written in the language of an evening rather than of
 * cinema. Nobody stands in front of a television deciding they are in the
 * mood for a 1970s Italian psychological drama; they decide they want
 * something dark, on their own, and short.
 */

export type Question = {
  key: "mood" | "party" | "length" | "era" | "place";
  prompt: string;
  /** Moods combine; the rest are one answer each. */
  multiple?: boolean;
  options: { value: string; label: string; note?: string }[];
};

export const QUESTIONS: Question[] = [
  {
    key: "mood",
    prompt: "How should it feel?",
    multiple: true,
    options: [
      { value: "dark", label: "Dark", note: "Crime, thriller, horror" },
      { value: "tender", label: "Tender", note: "Romance and drama" },
      { value: "thrilling", label: "Thrilling", note: "Action and adventure" },
      { value: "beautiful", label: "Beautiful", note: "Made to be looked at" },
      { value: "funny", label: "Funny", note: "Comedy" },
      { value: "strange", label: "Strange", note: "Science fiction, fantasy" },
    ],
  },
  {
    key: "party",
    prompt: "What kind of night?",
    options: [
      { value: "alone", label: "Just me" },
      { value: "date", label: "Date night" },
      { value: "friends", label: "With friends" },
      { value: "family", label: "Family" },
      { value: "background", label: "Background watch" },
      { value: "focused", label: "I want to concentrate" },
    ],
  },
  {
    key: "length",
    prompt: "How long have you got?",
    options: [
      { value: "short", label: "Quick watch", note: "Under 100 minutes" },
      { value: "normal", label: "Normal evening", note: "100–140" },
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
      { value: "south-asia", label: "South Asia" },
      { value: "southeast-asia", label: "Southeast Asia" },
      { value: "middle-east", label: "Middle East" },
      { value: "africa", label: "Africa" },
      { value: "oceania", label: "Oceania" },
    ],
  },
];

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
  note: string | null;
};
