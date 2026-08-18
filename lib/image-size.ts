import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Intrinsic dimensions for an image under public/, read straight from the file
 * header.
 *
 * Hero art arrives in whatever shape the artwork wanted — a 2:3 poster, a 5:4
 * plate, a wide banner — and guessing an aspect ratio in CSS either crops the
 * title off a poster or leaves a landscape plate floating in gutters. Reading
 * the real ratio removes the guess. No dependency: PNG and JPEG both state
 * their size in the first few bytes, and WebP states it in its RIFF chunk.
 */

export type ImageSize = { width: number; height: number };

const cache = new Map<string, ImageSize | null>();

function readPng(buffer: Buffer): ImageSize | null {
  // 8-byte signature, then an IHDR chunk whose width and height are big-endian
  // uint32s at offsets 16 and 20.
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}


function readWebp(buffer: Buffer): ImageSize | null {
  if (
    buffer.length < 30 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }

  const chunk = buffer.toString("ascii", 12, 16);

  // Lossy: 14 bytes of frame header, then two 16-bit fields whose top two
  // bits are scaling flags.
  if (chunk === "VP8 ") {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  // Lossless: 14 bits each, packed little-endian across four bytes.
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  // Extended: 24-bit width-1 and height-1.
  if (chunk === "VP8X") {
    return {
      width: (buffer.readUIntLE(24, 3) & 0xffffff) + 1,
      height: (buffer.readUIntLE(27, 3) & 0xffffff) + 1,
    };
  }

  return null;
}

function readJpeg(buffer: Buffer): ImageSize | null {
  if (buffer.readUInt16BE(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset < buffer.length - 9) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buffer[offset + 1];
    // SOF0–SOF15, excluding the DHT/JPG/DAC markers that share the range.
    const isFrameHeader =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;

    if (isFrameHeader) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
}

/** `src` is a public-relative path such as /media/journal/x/hero.png. */
export async function imageSize(src: string): Promise<ImageSize | null> {
  if (!src.startsWith("/")) return null;
  if (cache.has(src)) return cache.get(src) ?? null;

  let size: ImageSize | null = null;
  try {
    const file = path.join(process.cwd(), "public", src);
    // The header is all we need; 64KB covers a JPEG's segment walk comfortably.
    const buffer = await readFile(file);
    const head = buffer.subarray(0, 65536);
    size = readPng(head) ?? readJpeg(head) ?? readWebp(head);
  } catch {
    size = null;
  }

  cache.set(src, size);
  return size;
}
