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
  /**
   * Whether this question is asked before anything has been shown.
   *
   * Only three are. The page's whole argument is that describing an evening
   * beats filtering on metadata, and that argument is lost if describing the
   * evening takes longer than scrolling a grid would have — five questions
   * and nine sliders is a form, and nobody fills in a form to find out what
   * to watch. Era and region are real preferences and they are not what
   * anybody leads with, so they wait behind Fine tune with the sliders.
   */
  upfront?: boolean;
  options: { value: string; label: string; note?: string }[];
};

/** The three asked on arrival. Everything else is progressive disclosure. */
export const UPFRONT_KEYS = ["mood", "party", "length"] as const;

export const QUESTIONS: Question[] = [
  {
    key: "mood",
    prompt: "Tonight feels like…",
    multiple: true,
    upfront: true,
    options: [
      { value: "dark", label: "Dark" },
      { value: "tender", label: "Emotional" },
      { value: "thrilling", label: "Thrilling" },
      { value: "beautiful", label: "Beautiful" },
      { value: "funny", label: "Funny" },
      { value: "strange", label: "Strange" },
    ],
  },
  {
    key: "party",
    prompt: "I'm watching…",
    upfront: true,
    options: [
      { value: "alone", label: "Alone" },
      { value: "date", label: "Date" },
      { value: "friends", label: "Friends" },
      { value: "family", label: "Family" },
    ],
  },
  {
    key: "length",
    prompt: "I have…",
    upfront: true,
    options: [
      { value: "short", label: "Under 100m" },
      { value: "normal", label: "100–140m" },
      { value: "long", label: "140m+" },
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
