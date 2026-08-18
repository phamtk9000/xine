/**
 * The editorial devices an article can reach for.
 *
 * Long-form criticism read as one undifferentiated column is exhausting, and
 * the fix a magazine uses is not more prose — it is changes of register. A
 * thesis printed at poster size. A page that goes black for one sentence. A
 * quotation given a whole spread of nothing. A note in the margin the way a
 * critic annotates a screener.
 *
 * These are authored as fenced blocks in the markdown so an article stays a
 * readable document rather than a pile of JSX:
 *
 *   ::: thesis
 *   Tyler is the fantasy, not the thesis.
 *   :::
 *
 *   ::: interruption
 *   He is everything the Narrator isn't.
 *   :::
 *
 *   ::: quote Tyler Durden · Fight Club · 01:12:44
 *   You are not your job.
 *   :::
 *
 *   ::: note 00:21:11
 *   The camera never shows the doorway behind her.
 *   :::
 *
 * And one inline device, for emphasis that arrives as the reader reaches it:
 *
 *   Cooper has the data. But ==love closes the loop.==
 *
 * Every one of them degrades to ordinary readable text: with no CSS they are
 * still a heading, a paragraph, a blockquote and a mark.
 */

const DEVICES = ["thesis", "interruption", "quote", "note"] as const;
type Device = (typeof DEVICES)[number];

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Splits a quote's attribution line into its parts.
 *
 * `Tyler Durden · Fight Club · 01:12:44` gives a speaker, a film and a
 * timecode; any of the three may be missing, and a bare film name is the
 * common case for a title card or a line of narration.
 */
function attribution(meta: string) {
  const parts = meta
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;
  if (parts.length === 1) return { speaker: null, film: parts[0], time: null };
  return {
    speaker: parts[0],
    film: parts[1] ?? null,
    time: parts[2] ?? null,
  };
}

function renderDevice(device: Device, meta: string, body: string) {
  // remark has already turned the block's contents into paragraphs; the
  // devices want the words, not the wrapper.
  const inner = body
    .replace(/<\/?p>/g, "")
    .trim()
    .replace(/\n{2,}/g, "<br />");

  switch (device) {
    // Oversized, breaking the column grid. The strongest sentence in a
    // section, printed the size a magazine would print it.
    case "thesis":
      return `<aside class="device-thesis"><p>${inner}</p></aside>`;

    // The page stops. One sentence, a screen of nothing around it, then the
    // article resumes — a pause rather than more information.
    case "interruption":
      return `<aside class="device-interruption"><p>${inner}</p></aside>`;

    // A line from the film, treated as a line from the film rather than as a
    // pull quote. The emptiness around it is the whole point.
    case "quote": {
      const credit = attribution(meta);
      const lines = credit
        ? [
            credit.speaker &&
              `<span class="device-speaker">${credit.speaker}</span>`,
            credit.film && `<span class="device-film">${credit.film}</span>`,
            credit.time && `<span class="device-time">${credit.time}</span>`,
          ]
            .filter(Boolean)
            .join("")
        : "";
      return `<figure class="device-quote"><blockquote><p>${inner}</p></blockquote>${
        lines ? `<figcaption>${lines}</figcaption>` : ""
      }</figure>`;
    }

    // A critic's margin note: a timestamp, a term, a cross-reference. It sits
    // in the space beside the column rather than interrupting the argument.
    case "note":
      return `<aside class="device-note"${
        meta ? ` data-marker="${escapeAttribute(meta)}"` : ""
      }><p>${inner}</p></aside>`;
  }
}

/**
 * Compiles `::: device` blocks and `==emphasis==` in rendered article HTML.
 *
 * remark leaves the fences alone — they are not markdown — so by the time
 * this runs each one is a paragraph containing the marker and its contents.
 */
export function compileDevices(html: string) {
  const names = DEVICES.join("|");
  const pattern = new RegExp(
    `<p>:::\\s*(${names})([^\\n<]*)\\n([\\s\\S]*?):::</p>`,
    "g",
  );

  let out = html.replace(pattern, (_match, device, meta, body) =>
    renderDevice(device as Device, String(meta).trim(), String(body)),
  );

  // The same block written across separate paragraphs, which is what remark
  // produces when the contents contain a blank line.
  const spread = new RegExp(
    `<p>:::\\s*(${names})([^\\n<]*)</p>([\\s\\S]*?)<p>:::</p>`,
    "g",
  );
  out = out.replace(spread, (_match, device, meta, body) =>
    renderDevice(device as Device, String(meta).trim(), String(body)),
  );

  return emphasise(out);
}

/**
 * `==phrase==` becomes a mark that lights to the article's accent as the
 * reader reaches it. Skipped inside the devices above, which are already
 * emphatic — emphasis inside a thesis statement is emphasis about nothing.
 */
function emphasise(html: string) {
  return html.replace(/==([^=\n]+)==/g, '<mark class="emph">$1</mark>');
}
