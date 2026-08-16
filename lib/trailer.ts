import { fromCsv, fromLines } from "@/lib/serialize";

/**
 * Trailer Studio's scaffold.
 *
 * This is deterministic, not generated: a genre-aware starting structure the
 * writer then argues with. That is the honest version of the product today —
 * the beat map and shot count are real craft knowledge, and nothing here
 * pretends to be a creative decision that only the filmmaker can make.
 *
 * When a model is wired in, it should replace the prose inside these slots,
 * not the slots themselves.
 */

type GenreProfile = {
  palette: string;
  light: string;
  camera: string;
  design: string;
  sound: string;
  withhold: string;
};

const PROFILES: Record<string, GenreProfile> = {
  "psychological thriller": {
    palette:
      "Desaturated base with one warm intrusion. The warm colour should belong to the thing that is wrong.",
    light:
      "Motivated sources only, pushed a stop under. Reserve one unmotivated source for the reveal and never explain it.",
    camera:
      "Locked-off and square early, so the audience learns the geography. Break the axis after the midpoint by a degree or two — enough to feel, not enough to notice.",
    design:
      "Real locations with accumulated wear. The environment must look older than the story.",
    sound:
      "Room tone carries the dread. Score enters late and sparingly; the first cue should feel like a mistake.",
    withhold:
      "Never show the thing itself. Show the space around it and the face of someone looking at it.",
  },
  horror: {
    palette:
      "Cold shadow, single hot key. Keep saturation low until the last act so the blood reads.",
    light:
      "Hard sources, deep falloff, and large areas of frame left genuinely black.",
    camera:
      "Wide and static to build, handheld only when control is lost. Resist the push-in until you have earned it.",
    design: "Domestic detail, correct and specific, then one element wrong.",
    sound:
      "Low-frequency bed, silence as the actual weapon. Cut the track dead before the release.",
    withhold: "The creature, the body, and the ending. In that order.",
  },
  drama: {
    palette:
      "Naturalistic and warm, with a controlled shift across the film's timeline.",
    light: "Available light and practicals. Let faces fall into shadow.",
    camera:
      "Longer takes, minimal coverage, and a preference for the two-shot over the shot–reverse.",
    design: "Lived-in and specific. Props should look owned, not sourced.",
    sound: "Sparse score. Let rooms sound like rooms.",
    withhold: "The resolution of the central relationship.",
  },
  "science fiction": {
    palette:
      "One dominant non-natural hue for the built world, natural skin tones held against it.",
    light:
      "Large soft sources and hard practical accents. Scale reads through atmosphere.",
    camera:
      "Wide anamorphic for the world, tight and static for the human scenes.",
    design:
      "Every technology should imply a manufacturer and a maintenance budget.",
    sound: "Design-forward. The world's noise floor is a character.",
    withhold: "The scale of the antagonist and the cost of the choice.",
  },
  "dark comedy": {
    palette: "Bright, clean, slightly too pleasant. Comedy in the contrast.",
    light: "Flat and even. Nothing hides, which is what makes it uncomfortable.",
    camera:
      "Symmetrical and composed. The camera should be the only calm thing present.",
    design: "Aspirational surfaces, cheap underneath.",
    sound: "Needle drops against tone. Score plays the wrong emotion on purpose.",
    withhold: "How far it is willing to go.",
  },
};

const DEFAULT_PROFILE: GenreProfile = {
  palette: "Build from one colour that belongs to the protagonist and one that belongs to what opposes them.",
  light: "Motivated, consistent, and specific to each location's real sources.",
  camera:
    "Establish a grammar in the first ten minutes and only break it when the story does.",
  design: "Specific over decorative. Every object should have a reason to be owned.",
  sound: "Decide what the score is for before writing a note of it.",
  withhold: "The ending, and the true nature of the central relationship.",
};

export function creativeDirection(genre: string): GenreProfile {
  return PROFILES[genre.trim().toLowerCase()] ?? DEFAULT_PROFILE;
}

export type Beat = {
  from: string;
  to: string;
  label: string;
  intent: string;
};

/** The standard ninety-second concept trailer, timed. */
export const BEATS: Beat[] = [
  {
    from: "0:00",
    to: "0:08",
    label: "Establishing",
    intent:
      "Place and scale, no dialogue. One image that could only come from this film.",
  },
  {
    from: "0:08",
    to: "0:17",
    label: "Character introduction",
    intent:
      "Who we follow, doing the thing they are good at, before it stops working.",
  },
  {
    from: "0:17",
    to: "0:28",
    label: "The discovery",
    intent: "The disruption. State the premise plainly and only once.",
  },
  {
    from: "0:28",
    to: "0:42",
    label: "Escalation",
    intent:
      "Three to five shots, accelerating. Each one raises a question rather than answering one.",
  },
  {
    from: "0:42",
    to: "0:52",
    label: "The turn",
    intent:
      "The moment the audience realises the film is not what they assumed. Hold longer than feels comfortable.",
  },
  {
    from: "0:52",
    to: "1:08",
    label: "Montage",
    intent: "Consequence at speed. Cut on movement, not on dialogue.",
  },
  {
    from: "1:08",
    to: "1:14",
    label: "Silence",
    intent:
      "Kill the track. One image, held. This is the shot people will describe afterwards.",
  },
  {
    from: "1:14",
    to: "1:24",
    label: "Title",
    intent: "Title card, then one final line or image as a sting.",
  },
];

/** Eight shots is what a proof-of-concept can actually afford to build. */
export function storyboard(title: string, logline: string): {
  n: number;
  shot: string;
  note: string;
}[] {
  const subject = logline.split(/[,.]/)[0]?.trim() || title;
  return [
    {
      n: 1,
      shot: "Wide establishing, static",
      note: "The location as a fact. No character in frame, or one at minimal scale.",
    },
    {
      n: 2,
      shot: "Medium, protagonist at work",
      note: `Competence before collapse — ${subject} doing the thing they are known for.`,
    },
    {
      n: 3,
      shot: "Insert, the detail that is wrong",
      note: "Shot in isolation so it reads without explanation. This is the trailer's hook.",
    },
    {
      n: 4,
      shot: "Reverse, the reaction",
      note: "Hold on the face past the point of information. Let the audience read it.",
    },
    {
      n: 5,
      shot: "Tracking, moving into the space",
      note: "The first time the camera commits to going where the character goes.",
    },
    {
      n: 6,
      shot: "Wide, the confrontation",
      note: "Two figures, real distance between them. Blocking does the work.",
    },
    {
      n: 7,
      shot: "Close, the decision",
      note: "No dialogue. The choice must be visible.",
    },
    {
      n: 8,
      shot: "The held image",
      note: "The silence beat. Composed to survive being paused on.",
    },
  ];
}

export function parseReferences(brief: {
  filmReferences: string;
  visualReferences: string;
}) {
  return {
    films: fromCsv(brief.filmReferences),
    visual: fromLines(brief.visualReferences),
  };
}
