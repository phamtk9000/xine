/**
 * Enough of a community to make the retention layer legible on a fresh clone.
 * Every seeded account uses the same password so the whole thing can be poked
 * at without a signup flow: see SEED_PASSWORD below.
 */

export const SEED_PASSWORD = "xine1234";

export type SeedUser = {
  username: string;
  email: string;
  displayName: string;
  bio: string;
  location: string;
};

export const SEED_USERS: SeedUser[] = [
  {
    username: "huy",
    email: "huy@xine.test",
    displayName: "Huy",
    bio: "Architect by trade. Watching my way through everything shot on anamorphic. Slow cinema apologist.",
    location: "Hà Nội",
  },
  {
    username: "mai",
    email: "mai@xine.test",
    displayName: "Mai Trần",
    bio: "Programmer at a small festival. Interested in what Southeast Asian cinema does with duration.",
    location: "Sài Gòn",
  },
  {
    username: "kovacs",
    email: "kovacs@xine.test",
    displayName: "Kovács Anna",
    bio: "Cinematographer. I rate Visual too generously and I know it.",
    location: "Budapest",
  },
  {
    username: "dan",
    email: "dan@xine.test",
    displayName: "Dan Okonkwo",
    bio: "Sound designer. The Sound axis on this site exists because I complained.",
    location: "London",
  },
];

/**
 * [username, filmSlug, overall, story, direction, visual, performance, sound]
 * A null in the axis positions means that person left the breakdown blank —
 * which is the common case and should look normal in the UI.
 */
export type SeedRating = [
  string,
  string,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
];

export const SEED_RATINGS: SeedRating[] = [
  ["huy", "dune-part-two", 8.6, 8.2, 9.1, 9.5, 8.4, 9.0],
  ["huy", "blade-runner-2049", 9.0, 8.4, 9.2, 9.8, 8.6, 9.2],
  ["huy", "the-brutalist", 8.8, 8.5, 9.0, 9.4, 8.9, 8.2],
  ["huy", "enemy", 7.9, 7.4, 8.6, 8.4, 7.8, 7.5],
  ["huy", "stalker", 9.2, 8.8, 9.6, 9.7, 8.5, 9.0],
  ["huy", "the-shining", 9.0, null, null, null, null, null],
  ["huy", "in-the-mood-for-love", 9.4, 9.0, 9.6, 9.9, 9.3, 9.2],
  ["huy", "parasite", 8.9, 9.2, 9.0, 8.6, 9.0, 8.4],
  ["huy", "inside-the-yellow-cocoon-shell", 8.7, 8.0, 9.2, 9.4, 8.1, 8.6],
  ["huy", "aftersun", 8.5, null, null, null, null, null],
  ["huy", "past-lives", 8.2, null, null, null, null, null],
  ["huy", "the-zone-of-interest", 8.8, 8.2, 9.2, 8.9, 8.4, 9.9],

  ["mai", "inside-the-yellow-cocoon-shell", 9.3, 9.0, 9.5, 9.4, 9.0, 9.2],
  ["mai", "uncle-boonmee", 9.0, 8.6, 9.4, 9.0, 8.8, 9.1],
  ["mai", "cemetery-of-splendour", 8.6, 8.2, 9.0, 8.7, 8.4, 8.8],
  ["mai", "the-scent-of-green-papaya", 8.8, 8.4, 9.0, 9.4, 8.6, 8.9],
  ["mai", "glorious-ashes", 8.4, 8.6, 8.5, 8.4, 8.7, 7.9],
  ["mai", "song-lang", 8.0, 7.8, 8.0, 8.4, 8.2, 8.1],
  ["mai", "cyclo", 8.1, null, null, null, null, null],
  ["mai", "drive-my-car", 9.1, 9.4, 9.2, 8.6, 9.3, 8.7],
  ["mai", "burning", 8.9, 9.0, 9.0, 8.8, 9.1, 8.6],
  ["mai", "portrait-of-a-lady-on-fire", 9.2, 9.0, 9.4, 9.5, 9.3, 8.6],
  ["mai", "parasite", 8.7, null, null, null, null, null],

  ["kovacs", "the-brutalist", 9.4, 8.4, 9.4, 10.0, 9.0, 8.8],
  ["kovacs", "in-the-mood-for-love", 9.5, 8.8, 9.5, 10.0, 9.2, 9.0],
  ["kovacs", "chungking-express", 8.9, 7.9, 9.0, 9.8, 8.6, 9.0],
  ["kovacs", "under-the-skin", 8.8, 7.6, 9.2, 9.7, 8.4, 9.4],
  ["kovacs", "there-will-be-blood", 9.1, 8.8, 9.4, 9.6, 9.6, 9.2],
  ["kovacs", "mirror", 9.0, 8.0, 9.4, 9.9, 8.4, 8.8],
  ["kovacs", "blade-runner-2049", 9.2, 8.0, 9.2, 10.0, 8.4, 9.2],
  ["kovacs", "portrait-of-a-lady-on-fire", 9.1, 8.6, 9.2, 9.8, 9.0, 8.4],
  ["kovacs", "dune-part-two", 8.8, 7.8, 9.0, 9.8, 8.2, 9.2],

  ["dan", "the-zone-of-interest", 9.6, 8.8, 9.4, 8.8, 8.8, 10.0],
  ["dan", "under-the-skin", 9.2, 7.8, 9.0, 9.2, 8.6, 10.0],
  ["dan", "there-will-be-blood", 9.3, 8.9, 9.2, 9.0, 9.4, 10.0],
  ["dan", "stalker", 9.0, 8.6, 9.2, 9.2, 8.4, 9.6],
  ["dan", "drive-my-car", 8.6, 9.0, 8.8, 8.0, 9.0, 8.4],
  ["dan", "chungking-express", 8.4, 7.8, 8.6, 8.8, 8.2, 9.2],
  ["dan", "memories-of-murder", 8.8, 9.0, 8.8, 8.4, 9.0, 8.6],
  ["dan", "perfect-days", 8.5, 8.0, 8.6, 8.4, 9.0, 9.0],
  ["dan", "parasite", 9.0, 9.2, 9.0, 8.8, 9.0, 9.2],
];

export const SEED_REVIEWS: {
  username: string;
  film: string;
  spoilers: boolean;
  body: string;
}[] = [
  {
    username: "huy",
    film: "the-brutalist",
    spoilers: false,
    body: "I design buildings for a living, so I went in braced for the usual nonsense about architects — the lone genius, the sketch on a napkin, the client who simply doesn't understand. It does some of that. What it also does, and what I have never seen a film do, is treat a commission as a transaction in which the money buys the man along with the drawing. The long section in the quarry is the whole thesis: material extracted, shipped, and paid for.\n\nThe VistaVision is not decoration either. A wide frame makes a room readable as a room, which matters when the room is the argument.",
  },
  {
    username: "kovacs",
    film: "in-the-mood-for-love",
    spoilers: false,
    body: "Doyle and Lee Ping-bing shot this over more than a year, on and off, and you can see the accumulation in it — the lighting is not consistent in the way a scheduled shoot is consistent, it is consistent in the way a memory is. Every corridor is lit as if someone is already looking back on it.\n\nI rated Visual a 10 and I stand by it. There is no shot in this film that is merely coverage.",
  },
  {
    username: "mai",
    film: "inside-the-yellow-cocoon-shell",
    spoilers: false,
    body: "Three hours, and I have been arguing about it since. What strikes me most is how unafraid it is of Vietnamese Catholicism as a subject — not as folklore, not as production design, but as an actual live question the film is asking in good faith.\n\nThe long take through the fog on the motorbike will be the shot everyone talks about. The one I keep returning to is much smaller: the karaoke bar, and how the camera simply waits.",
  },
  {
    username: "dan",
    film: "the-zone-of-interest",
    spoilers: false,
    body: "Johnnie Burn built a sound library over a year of research and the result is the only element of this film doing any depicting at all. The image gives you a garden. The track gives you the camp. Your brain assembles the thing neither one shows.\n\nI have never been so certain that a film would collapse entirely if you muted it. Ten on Sound. There was no other number available to me.",
  },
  {
    username: "mai",
    film: "drive-my-car",
    spoilers: true,
    body: "The drive to Hokkaido is where it finally breaks open, and I think the reason it works is that Hamaguchi has spent two hours training you to sit still in that car. By the time Misaki tells him about her mother, the film has established the passenger seat as the only place anyone tells the truth.\n\nThe multilingual Vanya is not a gimmick. Watching actors respond to a language they do not speak is exactly what the film thinks grief is.",
  },
  {
    username: "huy",
    film: "stalker",
    spoilers: false,
    body: "Nothing happens, at enormous length, and I was never once bored. The trick is that Tarkovsky makes walking dangerous by refusing to show you a single rule of the Zone that you could verify. You are told the straight path is deadly. You never see it kill anyone. So you believe it completely.",
  },
  {
    username: "kovacs",
    film: "dune-part-two",
    spoilers: false,
    body: "Fraser shot the Giedi Prime sequences with infrared and it is the one genuinely new-looking thing in a very expensive year of filmmaking. Black sun, white skin, no colour information at all. A studio let them do that in the middle of a tentpole.\n\nStory is the weakest axis here and I do not think that is a criticism. It is an adaptation of a book everyone has read; the job was never surprise.",
  },
  {
    username: "dan",
    film: "perfect-days",
    spoilers: false,
    body: "A film about routine has to solve a rhythm problem, and the cassettes solve it. Each one arrives as a downbeat. Take the music out and the structure disappears entirely.",
  },
];

export const SEED_LISTS: {
  slug: string;
  title: string;
  description: string;
  editorial: boolean;
  owner?: string;
  films: string[];
}[] = [
  {
    slug: "the-vietnamese-canon-in-progress",
    title: "The Vietnamese Canon, In Progress",
    description:
      "Nobody has fixed this list yet, which is precisely why it is worth keeping. Six films that any argument about Vietnamese cinema has to get past first.",
    editorial: true,
    films: [
      "the-scent-of-green-papaya",
      "cyclo",
      "song-lang",
      "glorious-ashes",
      "inside-the-yellow-cocoon-shell",
    ],
  },
  {
    slug: "rooms-that-should-not-exist",
    title: "Rooms That Should Not Exist",
    description:
      "Architecture as antagonist. Buildings whose plans do not match their interiors, and the people who notice too late.",
    editorial: true,
    films: ["the-shining", "enemy", "parasite", "the-brutalist", "stalker"],
  },
  {
    slug: "sound-first",
    title: "Sound First",
    description:
      "Films that would be unrecognisable muted. Programmed with the Sound axis in mind — every entry here averages above 9 on it.",
    editorial: true,
    films: [
      "the-zone-of-interest",
      "under-the-skin",
      "there-will-be-blood",
      "stalker",
    ],
  },
  {
    slug: "the-long-take-belt",
    title: "The Long Take Belt",
    description:
      "Thailand, Vietnam, Taiwan, and the shared conviction that a shot should end when the scene does, not when the point does.",
    editorial: true,
    films: [
      "uncle-boonmee",
      "cemetery-of-splendour",
      "inside-the-yellow-cocoon-shell",
      "drive-my-car",
    ],
  },
  {
    slug: "watched-at-3am",
    title: "Watched at 3am and never recovered",
    description:
      "Personal list. Films I put on because I could not sleep and which then made the situation considerably worse.",
    editorial: false,
    owner: "huy",
    films: ["enemy", "under-the-skin", "mirror", "the-shining"],
  },
  {
    slug: "programming-notes-2026",
    title: "Programming notes — 2026 sidebar",
    description:
      "Shortlist for a sidebar on duration. Still cutting this down; the argument is that slowness is a regional inheritance, not an art-house import.",
    editorial: false,
    owner: "mai",
    films: [
      "inside-the-yellow-cocoon-shell",
      "uncle-boonmee",
      "cemetery-of-splendour",
      "perfect-days",
      "drive-my-car",
    ],
  },
];

export const SEED_PROJECT = {
  owner: "huy",
  title: "The Fourteenth Room",
  genre: "Psychological thriller",
  premise:
    "A young Vietnamese architect working in Budapest discovers that the apartment building he designed contains a room that does not appear on any set of the original plans — including his own.",
  logline:
    "A young architect discovers an undocumented room inside the Budapest apartment building he designed, and the deeper he investigates the less certain he becomes that he did not draw it himself.",
  stage: "visual",
  stages: {
    idea:
      "This started with a real thing. I was doing a handover survey on a residential block in District VII and the measured floor area came back forty square metres over the drawings. It was a stairwell void that had been enclosed at some point during construction and never recorded. Completely mundane. Somebody sealed it up and nobody wrote it down.\n\nI could not stop thinking about it. A building is supposed to be the most documented object a person can make — there are drawings, permits, structural calculations, inspection records. And there was a room in it that officially did not exist.\n\nThe film is about what it does to a person whose entire professional identity is precision when the thing they made turns out to contain something they cannot account for. It has to be a film because the horror is spatial. You cannot write this and have it land; you have to make an audience sit inside a floor plan for ninety minutes until they know it, and then break it.",
    logline:
      "A young architect discovers an undocumented room inside the Budapest apartment building he designed, and the deeper he investigates the less certain he becomes that he did not draw it himself.\n\nAlternates:\n\n— An architect finds a room in his own building that is on no plan, and the search for who built it becomes a search for who he was during the eighteen months he cannot remember designing it.\n\n— Every drawing says the room is not there. The building says otherwise.",
    synopsis:
      "MINH, 34, is a Vietnamese architect who has spent nine years in Budapest and is one project away from being made a partner. His first solo building — a seven-storey residential block in District VII — completes.\n\nDuring the handover survey the measured floor area exceeds the drawings by forty square metres. Minh assumes a survey error, then a contractor's deviation. Neither checks out. He locates the discrepancy on the fourth floor: a sealed volume between units 4B and 4C with no door, no permit record and no presence on any drawing set in the archive.\n\nHe opens it. The room is finished — plastered, wired, with a window that from the outside reads as a blank panel. It is not a construction void. Somebody built it deliberately.\n\nMinh pulls the project history. The permit drawings carry his signature and a revision date inside an eighteen-month period during which he was, per his own memory, working on an entirely different scheme in Vienna. He contacts the contractor, who remembers him being on site weekly. He was not.\n\nThe investigation splits. One track is administrative and entirely solvable: the practice partner, ISTVÁN, has been running a second set of drawings through the office to launder unpermitted floor area across a dozen buildings, using junior architects' credentials. Minh's signature was applied, not given.\n\nThe other track does not resolve. Minh begins to remember the room. Not as a discovery — as a design decision. He remembers choosing the window position.\n\nHe confronts István and gets a complete confession to the fraud, which explains the signature and explains nothing about the memory. In the last movement Minh returns to the room alone at night with the original drawings, and finds, in his own hand, in the margin of a sheet he has looked at four hundred times, a dimension for the room. It has always been there.\n\nThe film ends with Minh sitting inside the room as dawn comes through the window that does not exist on the elevation. He is not frightened. He is home.",
    characters:
      "MINH, 34 — Vietnamese, in Budapest nine years. Wants partnership; needs to be believed. Precision is not a habit for him, it is the argument he has been making since he arrived that he belongs here. He will not report the discrepancy, because reporting it means an audit, and an audit means a foreigner's competence in question. That refusal is what traps him.\n\nISTVÁN, 58 — Senior partner. Wants the practice to survive and has been forging floor area for six years to keep it solvent. Genuinely fond of Minh. His confession is honest and useless: he can account for the signature and not for the room.\n\nZSÓFI, 41 — Building inspector. Wants a correct file. She is the only character with no psychological stake, which makes her the audience's instrument: whatever she confirms is true.\n\nLAN, 36 — Minh's sister in Hà Nội, present only by phone. Wants him to come home. She is the one who says the thing the film will not: that he has been building a version of himself here for nine years, and it has a room in it he never showed anyone.",
    structure:
      "ACT ONE — the discrepancy. Open on the handover survey. Establish the building as knowable: we see the plans, we walk the floors, we learn the geometry. First turn at 22 minutes: Minh opens the wall and the room is finished.\n\nACT TWO A — the administrative investigation. Archive, contractor, permit office. This act plays as procedural and is largely satisfying. Midpoint at 52 minutes: the revision date. He was in Vienna.\n\nACT TWO B — the memory. The two investigations run in parallel and pull opposite directions. Every fact István supplies makes the fraud more explicable and the memory less. Second turn at 88 minutes: Minh describes the window position to Zsófi before he has seen that elevation.\n\nACT THREE — the confession lands at 96 minutes and deliberately resolves the wrong mystery. The final fifteen minutes are Minh alone with the drawings. The marginal dimension. The room at dawn.\n\nThe audience's understanding changes three times: the room was built by someone, then the room was built fraudulently, then the room was designed.",
    visual:
      "The film has to be legible as architecture before it can be illegible as architecture. That is the whole strategy.\n\nCAMERA — Act One is locked off and symmetrical, always square to the wall, wide enough to read the plan. We are teaching the audience the building. From the midpoint the camera begins to sit fractionally off-axis: never enough to notice, consistently enough to feel. Act Three is handheld for the first time.\n\nLENS — Spherical, wide-normal. 25mm and 32mm carry the building. No long lenses until the memory sequences, which are 85mm and compress the corridors into flat planes.\n\nPALETTE — Hungarian interwar interiors: ochre, oxblood, brass, and a great deal of unfinished plaster grey. The room itself is the only warm space in the film. This is the inversion — the wrong place looks like the only comfortable one.\n\nLIGHT — Practical and daylight only for the first two acts, motivated to the point of austerity. The room's window is the single unmotivated light source in the film, and no one remarks on it.\n\nPRODUCTION DESIGN — Real District VII stock. The building must feel period-adjacent, not new-build, so the discrepancy reads as accumulated rather than designed. Drawings on screen must be correct: we hire a working architect to produce a complete, buildable set, including the marginal dimension, and it appears in shot from the first ten minutes.",
    trailer: "",
    deck: "",
    business: "",
    production: "",
  },
} as const;

export const SEED_BRIEF = {
  owner: "huy",
  title: "The Fourteenth Room",
  genre: "Psychological thriller",
  logline:
    "A young architect discovers an undocumented room inside a Budapest apartment building.",
  filmReferences: ["The Shining", "Enemy", "The Brutalist"],
  visualReferences: [
    "Interwar Budapest stairwell, brass handrail, ochre plaster",
    "Measured survey drawing with a hand-annotated dimension",
    "Sealed window read as a blank panel from the street elevation",
    "Single warm interior against a building of grey",
  ],
};
