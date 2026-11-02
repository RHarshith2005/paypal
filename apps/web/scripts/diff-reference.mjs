/**
 * Reference diff harness.
 *
 * Screenshots the full ?frame=1 stage at 2212×1659 and compares it with
 * public/design/reference.webp, block by block, ignoring the text regions the
 * generated design cannot match (type rendering differs between tools).
 *
 *   pnpm design:diff              # needs the web app on :5173
 *   STAGE_URL=http://localhost:5173 pnpm design:diff
 *
 * The reference file is not in this repository yet, so until it is added this
 * script writes the stage screenshot and exits 0 with instructions. Once the
 * file exists it exits 1 when any block is off by more than TOLERANCE.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const BASE = process.env.STAGE_URL ?? "http://localhost:5173";
const TOLERANCE = Number(process.env.STAGE_TOLERANCE ?? 0.02);
const OUT_DIR = path.resolve("design");
const REFERENCE = path.join(OUT_DIR, "reference.webp");
const STAGE = path.join(OUT_DIR, "stage.png");

/** Blocks as delivered, in stage coordinates. */
const BLOCKS = [
  { name: "logo", x: 155, y: 183, w: 420, h: 45 },
  { name: "nav pill", x: 751, y: 166, w: 710, h: 77 },
  { name: "header icons", x: 1803, y: 166, w: 254, h: 77 },
  { name: "heading", x: 155, y: 290, w: 900, h: 80 },
  { name: "balance card", x: 155, y: 419, w: 829, h: 450 },
  { name: "income card", x: 1007, y: 419, w: 408, h: 214 },
  { name: "expense card", x: 1007, y: 656, w: 408, h: 213 },
  { name: "deal flow card", x: 155, y: 892, w: 619, h: 450 },
  { name: "verdict split", x: 797, y: 892, w: 618, h: 450 },
  { name: "recent deals", x: 155, y: 1365, w: 1260, h: 172 },
  { name: "right rail", x: 1438, y: 288, w: 619, h: 1205 },
];

/**
 * Text regions inside each block, in stage coordinates. Type is authored in the
 * editor, so these are excluded from the geometry diff.
 */
const MASKS = [
  { x: 155, y: 300, w: 860, h: 70 }, // H1
  { x: 183, y: 447, w: 700, h: 60 }, // balance title
  { x: 183, y: 520, w: 520, h: 110 }, // balance number
  { x: 183, y: 640, w: 640, h: 50 }, // balance subline
  { x: 183, y: 745, w: 620, h: 96 }, // balance buttons
  { x: 1035, y: 447, w: 350, h: 50 }, // KPI titles
  { x: 1035, y: 500, w: 260, h: 80 },
  { x: 1035, y: 684, w: 350, h: 50 },
  { x: 1035, y: 737, w: 260, h: 80 },
  { x: 183, y: 920, w: 300, h: 50 }, // flow header
  { x: 183, y: 1050, w: 500, h: 60 }, // tooltip
  { x: 825, y: 920, w: 300, h: 50 }, // split header
  { x: 1130, y: 1020, w: 240, h: 400 }, // legend
  { x: 183, y: 1393, w: 400, h: 50 }, // recent deals header
  { x: 183, y: 1470, w: 1180, h: 120 }, // first row text
  { x: 1466, y: 316, w: 300, h: 50 }, // rail header
  { x: 1466, y: 700, w: 520, h: 300 }, // card stack face
  { x: 1466, y: 1180, w: 520, h: 300 }, // mandates list
];

function blank(img, rect) {
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const index = (img.width * y + x) << 2;
      img.data[index] = 0;
      img.data[index + 1] = 0;
      img.data[index + 2] = 0;
      img.data[index + 3] = 255;
    }
  }
}

function crop(img, rect) {
  const out = new PNG({ width: rect.w, height: rect.h });
  PNG.bitblt(img, out, rect.x, rect.y, rect.w, rect.h, 0, 0);
  return out;
}

async function shoot() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2212, height: 1659 }, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/?frame=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  const buffer = await page.screenshot();
  await browser.close();
  fs.writeFileSync(STAGE, buffer);
  return PNG.sync.read(buffer);
}

const stage = await shoot();
console.log(`stage → ${path.relative(process.cwd(), STAGE)} (2212×1659)`);

if (!fs.existsSync(REFERENCE)) {
  console.log(
    [
      "",
      "No reference to diff against.",
      `Save the 2212×1659 canvas to ${path.relative(process.cwd(), REFERENCE)} and rerun.`,
      "The block list, masks and tolerances in this script are already keyed to it.",
      "",
    ].join("\n"),
  );
  process.exit(0);
}

const reference = PNG.sync.read(fs.readFileSync(REFERENCE));
if (reference.width !== stage.width || reference.height !== stage.height) {
  console.error(
    `Reference is ${reference.width}×${reference.height}; the stage renders ${stage.width}×${stage.height}. Resize the reference to 2212×1659 first.`,
  );
  process.exit(1);
}

const referenceMasked = PNG.sync.read(fs.readFileSync(REFERENCE));
for (const mask of MASKS) {
  blank(referenceMasked, mask);
  blank(stage, mask);
}

let failed = 0;
for (const block of BLOCKS) {
  const a = crop(referenceMasked, block);
  const b = crop(stage, block);
  const diff = new PNG({ width: block.w, height: block.h });
  const changed = pixelmatch(a.data, b.data, diff.data, block.w, block.h, { threshold: 0.12 });
  const ratio = changed / (block.w * block.h);
  const status = ratio <= TOLERANCE ? "ok" : "OFF";
  if (status === "OFF") failed += 1;
  console.log(
    `${status.padEnd(3)} ${block.name.padEnd(16)} ${String(changed).padStart(7)} px  ${(ratio * 100).toFixed(2)}%`,
  );
  if (status === "OFF") {
    fs.writeFileSync(path.join(OUT_DIR, `diff-${block.name.replace(/\s+/g, "-")}.png`), PNG.sync.write(diff));
  }
}

console.log(failed === 0 ? "\nAll blocks within tolerance." : `\n${failed} block(s) outside tolerance.`);
process.exit(failed === 0 ? 0 : 1);
