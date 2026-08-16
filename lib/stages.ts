/** The CREATE pipeline: idea → production, one stage at a time. */

export const STAGES = [
  {
    key: "idea",
    index: 1,
    label: "Idea",
    blurb: "The premise in its rawest form, and why it has to be a film.",
    prompt:
      "What is the film about, and what made you want to make it? Two or three paragraphs, no polish required.",
  },
  {
    key: "logline",
    index: 2,
    label: "Logline",
    blurb: "One sentence. Protagonist, disruption, stakes.",
    prompt:
      "Write the film in a single sentence: who it follows, what breaks their world, and what it costs them.",
  },
  {
    key: "synopsis",
    index: 3,
    label: "Synopsis",
    blurb: "A page that carries the whole shape of the story.",
    prompt:
      "Tell the whole story in about a page, ending included. This is not a teaser — a reader should finish knowing how it resolves.",
  },
  {
    key: "characters",
    index: 4,
    label: "Characters",
    blurb: "Who carries the film, and what each one wants.",
    prompt:
      "For each principal: what they want, what they actually need, and what they are unwilling to do to get it.",
  },
  {
    key: "structure",
    index: 5,
    label: "Story structure",
    blurb: "Acts, turns, and the sequence that holds them.",
    prompt:
      "Break the story into acts and mark the turns. Where does the audience's understanding change?",
  },
  {
    key: "visual",
    index: 6,
    label: "Visual direction",
    blurb: "Palette, lens, light, production design.",
    prompt:
      "Describe how the film looks and why. Colour, camera, lighting, spaces, texture — tied back to what the story is doing.",
  },
  {
    key: "trailer",
    index: 7,
    label: "Trailer concept",
    blurb: "The ninety seconds that sell it.",
    prompt:
      "What does the trailer withhold, and what does it promise? Build this out properly in Trailer Studio.",
  },
  {
    key: "deck",
    index: 8,
    label: "Pitch deck",
    blurb: "The document that goes in front of money.",
    prompt:
      "Title, logline, tone, comparables, audience, team, ask. What is the single image on the cover?",
  },
  {
    key: "business",
    index: 9,
    label: "Business plan",
    blurb: "Budget band, financing route, revenue path.",
    prompt:
      "What does it cost, where does that money come from, and how does it come back? Be specific about the band, not the cent.",
  },
  {
    key: "production",
    index: 10,
    label: "Production",
    blurb: "Roadmap from packaged to shot.",
    prompt:
      "Schedule, locations, cast and crew strategy, and the three things most likely to go wrong.",
  },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

export const STAGE_KEYS = STAGES.map((s) => s.key) as readonly StageKey[];

export function getStage(key: string) {
  return STAGES.find((s) => s.key === key) ?? null;
}

export function isStageKey(value: string): value is StageKey {
  return STAGE_KEYS.includes(value as StageKey);
}

export function nextStage(key: string) {
  const i = STAGES.findIndex((s) => s.key === key);
  if (i === -1 || i === STAGES.length - 1) return null;
  return STAGES[i + 1];
}

export function previousStage(key: string) {
  const i = STAGES.findIndex((s) => s.key === key);
  if (i <= 0) return null;
  return STAGES[i - 1];
}

/** The CONSULT tiers. Prices are bands, not quotes. */
export const SERVICES = [
  {
    key: "idea-development",
    title: "Idea Development",
    output: "Concept + positioning",
    detail:
      "We pressure-test the premise, find its audience, and place it against what already exists.",
    deliverables: [
      "Concept statement",
      "Audience and positioning note",
      "Comparable titles with performance context",
    ],
    band: "€1,200 – €2,500",
    duration: "2 weeks",
  },
  {
    key: "story-development",
    title: "Story Development",
    output: "Logline + synopsis + treatment",
    detail:
      "From premise to a treatment a producer can read in one sitting and act on.",
    deliverables: ["Logline set", "Synopsis", "Treatment, 8–15 pages"],
    band: "€2,500 – €6,000",
    duration: "4 weeks",
  },
  {
    key: "visual-development",
    title: "Visual Development",
    output: "Moodboard + visual identity",
    detail:
      "The look, built as a document: palette, lens language, production design, key art.",
    deliverables: [
      "Visual direction document",
      "Moodboards by sequence",
      "Key art, two routes",
    ],
    band: "€3,000 – €8,000",
    duration: "4 weeks",
  },
  {
    key: "concept-trailer",
    title: "Concept Trailer",
    output: "Trailer / teaser",
    detail:
      "A proof-of-concept cut that shows financiers the film rather than describing it.",
    deliverables: [
      "Creative direction",
      "Storyboard and shot list",
      "Trailer script and timing",
      "Finished cut, 60–120 seconds",
    ],
    band: "€6,000 – €25,000",
    duration: "6–10 weeks",
  },
  {
    key: "pitch-package",
    title: "Pitch Package",
    output: "Investor-ready pitch deck",
    detail:
      "Everything above, designed into one document built for the room it goes into.",
    deliverables: [
      "Designed deck, 15–25 pages",
      "One-pager",
      "Speaker notes and pitch rehearsal",
    ],
    band: "€3,500 – €9,000",
    duration: "3–5 weeks",
  },
  {
    key: "business-plan",
    title: "Film Business Plan",
    output: "Budget + revenue strategy",
    detail:
      "Budget band, financing structure, recoupment waterfall and a realistic revenue case.",
    deliverables: [
      "Top-sheet budget",
      "Financing plan including soft money",
      "Revenue projections and recoupment schedule",
    ],
    band: "€4,000 – €12,000",
    duration: "5 weeks",
  },
  {
    key: "production-strategy",
    title: "Production Strategy",
    output: "Production roadmap",
    detail:
      "The route from packaged project to principal photography, with the risks named.",
    deliverables: [
      "Production roadmap",
      "Schedule and location strategy",
      "Risk register",
    ],
    band: "€3,000 – €10,000",
    duration: "4 weeks",
  },
] as const;

export type ServiceKey = (typeof SERVICES)[number]["key"];

export function getService(key: string) {
  return SERVICES.find((s) => s.key === key) ?? null;
}
