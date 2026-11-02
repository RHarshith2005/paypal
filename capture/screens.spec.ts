import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const API = "http://127.0.0.1:8787";
const DIR = path.resolve("pictures");

const manifest: string[] = [];
const failures: string[] = [];
let index = 0;

async function shot(page: Page, name: string, note: string) {
  index += 1;
  const file = `${String(index).padStart(2, "0")}-${name}.png`;
  await page.evaluate(() => {
    for (const node of document.querySelectorAll(".hs-scroll")) node.scrollTop = 0;
  });
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(DIR, file), animations: "disabled" });
  manifest.push(`| \`${file}\` | ${note} |`);
}

async function elementShot(page: Page, locator: Locator, name: string, note: string) {
  index += 1;
  const file = `${String(index).padStart(2, "0")}-${name}.png`;
  await page.waitForTimeout(400);
  await locator.first().screenshot({ path: path.join(DIR, file), animations: "disabled", timeout: 10_000 });
  manifest.push(`| \`${file}\` | ${note} |`);
}

/** Optional interaction: record it as skipped instead of aborting the walk. */
async function attempt(label: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  }
}

test.describe.configure({ mode: "serial" });

test("capture every route and interaction", async ({ page, request }) => {
  test.setTimeout(300_000);

  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });

  const reset = await request.post(`${API}/api/demo/reset`);
  expect(reset.ok(), `demo reset failed: ${reset.status()}`).toBeTruthy();

  const disputeBody = (await (await request.get(`${API}/api/disputes`)).json()) as {
    disputes: Array<{ dispute: { id: string } }>;
  };
  const disputeId = disputeBody.disputes[0]?.dispute.id ?? "dsp_missing";

  // ---------------------------------------------------------------- dashboard
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Trust Dashboard" })).toBeVisible();
  await shot(page, "dashboard", "Dashboard at 1991×1415, seeded Case A + Case B");

  await elementShot(page, page.locator("nav[aria-label='Primary']"), "component-nav", "Nav pill with active tab and knob");
  await elementShot(page, page.getByTestId("balance-card"), "component-balance-card", "Balance card, fold shapes, both actions");
  await elementShot(page, page.getByTestId("deal-flow-card"), "component-deal-flow", "Deal flow card, five bars");
  await elementShot(page, page.getByTestId("verdict-split-card"), "component-verdict-donut", "Verdict split donut and legend");
  await elementShot(page, page.getByTestId("page-rail"), "component-agent-rail", "Right rail: agents, avatars, mandates");
  await elementShot(page, page.getByTestId("recent-deals-card"), "component-recent-deals", "Recent deals table");

  // Bars filter the list by period.
  await attempt("bar filter", async () => {
    const bar = page.getByRole("button", { name: /: \d+ deals$/ }).first();
    await bar.click();
    await expect(page.getByText(/Filtering Recent deals/)).toBeVisible();
  });
  await shot(page, "dashboard-bar-filter", "A deal-flow bar selected; Recent deals filtered by period");

  // Donut legend filters by verdict.
  await attempt("donut filter", async () => {
    await page.getByRole("button", { name: /Valid purchase/ }).click();
  });
  await shot(page, "dashboard-verdict-filter", "Verdict legend segment selected; Recent deals filtered by verdict");

  // Agent stack: bring another card forward.
  await attempt("agent card", async () => {
    await page.locator("button[aria-label^='Bring ']").last().click();
  });
  await shot(page, "dashboard-agent-card", "Agent card stack: another agent brought to the front");

  // Search, bell, account overlays.
  await attempt("search", async () => {
    await page.getByRole("button", { name: "Search deals and ledger" }).click();
    await page.getByLabel("Search deals and ledger entries").fill("deal_");
    await expect(page.getByText(/Ledger ·/).first()).toBeVisible();
  });
  await shot(page, "overlay-search", "Search overlay with deal and ledger results");
  await page.keyboard.press("Escape");

  await attempt("notifications", async () => {
    await page.getByRole("button", { name: "Rulings and guard signals" }).click();
    await expect(page.getByText("Rulings and guard signals").first()).toBeVisible();
  });
  await shot(page, "overlay-notifications", "Notification overlay: court rulings");
  await page.keyboard.press("Escape");

  await attempt("account menu", async () => {
    await page.getByRole("button", { name: "Account and demo menu" }).click();
    await expect(page.getByText("Demo principal")).toBeVisible();
  });
  await shot(page, "overlay-account", "Account menu with demo routes and SIMULATED identity note");
  await page.keyboard.press("Escape");

  // Mandate drawer.
  await attempt("mandate drawer", async () => {
    await page.getByRole("button", { name: "New mandate" }).first().click();
    await expect(page.getByRole("dialog", { name: "New mandate" })).toBeVisible();
  });
  await shot(page, "drawer-new-mandate", "Right-side mandate drawer with canonical envelope preview");
  await page.keyboard.press("Escape");

  // Frame mode + dev reference overlay.
  await page.setViewportSize({ width: 2212, height: 1659 });
  await page.goto("/?frame=1");
  await page.waitForTimeout(900);
  await shot(page, "stage-frame", "Full 2212×1659 stage: backdrop, bezel, screen");
  await attempt("reference overlay", async () => {
    await page.keyboard.press("o");
    await expect(page.getByText(/reference.webp not found|REFERENCE/).first()).toBeVisible();
  });
  await shot(page, "stage-reference-overlay", "Press-O reference overlay (reports the missing reference file)");
  await page.keyboard.press("o");
  await page.setViewportSize({ width: 1991, height: 1415 });

  // -------------------------------------------------------------------- deals
  await page.goto("/deals");
  await expect(page.getByRole("heading", { name: "Deals", exact: true })).toBeVisible();
  await shot(page, "deals", "Deals list");

  await attempt("deals filter", async () => {
    await page.getByRole("button", { name: "Settled", exact: true }).click();
  });
  await shot(page, "deals-filter-settled", "Deals filtered to settled");

  await attempt("open deal", async () => {
    await page.locator("button:has-text('signatures')").first().click();
    await expect(page).toHaveURL(/\/deals\/deal_/);
  });
  await page.waitForTimeout(900);
  await shot(page, "deal-detail", "Deal page: negotiation, handshake, payment, receipt");

  await attempt("verify receipt", async () => {
    const verify = page.getByRole("button", { name: "Verify in browser" });
    await verify.scrollIntoViewIfNeeded();
    await verify.click();
    await expect(page.getByText("Chain and receipt digest agree.")).toBeVisible();
  });
  await shot(page, "deal-verify", "Browser verification: chain and receipt digest agree");

  await attempt("receipt panel", async () => {
    await page.getByText("Dual-signed receipt").first().scrollIntoViewIfNeeded();
  });
  await attempt("receipt element", async () => {
    await elementShot(
      page,
      page.locator("section").filter({ hasText: "Dual-signed receipt" }),
      "component-receipt",
      "Dual-signed receipt panel with verification result",
    );
  });

  // ----------------------------------------------------------------- disputes
  await page.goto("/disputes");
  await expect(page.getByRole("heading", { name: /^Case A/ })).toBeVisible();
  await shot(page, "disputes", "Dispute court: Case A and Case B side by side");

  await attempt("drafted response", async () => {
    await page.getByText("Drafted merchant response").first().click();
  });
  await shot(page, "disputes-drafted-response", "Drafted merchant response expanded");

  await page.goto(`/disputes/${disputeId}`);
  await page.waitForTimeout(900);
  await shot(page, "dispute-detail", "Single dispute: verdict, liability, evidence packet");

  // ------------------------------------------------------------------- ledger
  await page.goto("/ledger");
  await expect(page.getByText("Evidence integrity")).toBeVisible();
  await shot(page, "ledger", "Ledger: AG Grid entries and evidence integrity panel");

  await attempt("tamper", async () => {
    await page.getByRole("button", { name: /Flip one byte in #0/ }).click();
    await expect(page.getByText(/^First break: entry #0$/)).toBeVisible();
  });
  await shot(page, "ledger-tampered", "Tampered chain: the exact broken entry is named");

  await attempt("restore", async () => {
    await page.getByRole("button", { name: "Restore" }).click();
  });
  await shot(page, "ledger-restored", "Chain restored");

  // ------------------------------------------------------------------ mandate
  await page.goto("/mandate");
  await page.waitForTimeout(800);
  await shot(page, "mandate", "Signed mandates with budget meters");

  await page.goto("/mandate/new");
  await page.waitForTimeout(800);
  await shot(page, "mandate-builder", "Mandate builder with canonical JSON preview");

  await attempt("builder validation", async () => {
    const perItem = page.getByLabel(/per.item/i).first();
    await perItem.fill("9999", { timeout: 10_000 });
    await expect(page.getByText("The mandate cannot be signed yet")).toBeVisible({ timeout: 10_000 });
  });
  await shot(page, "mandate-builder-invalid", "Builder validation: per-item cap above the lifetime cap");

  // ------------------------------------------------------- trust and recording
  await page.goto("/trust");
  await page.waitForTimeout(800);
  await shot(page, "trust", "Trust scoreboard with the recomputable formula");

  await page.goto("/demo/script");
  await page.waitForTimeout(800);
  await shot(page, "demo-script", "Recording script: eight beats");

  await attempt("demo progress", async () => {
    await page.getByRole("button", { name: "Mark beat done" }).click();
  });
  await shot(page, "demo-script-progress", "Recording script with a beat marked done");

  // --------------------------------------------------------------- live run
  await page.goto("/");
  await page.waitForTimeout(900);
  await attempt("run case A", async () => {
    await page.getByRole("button", { name: "Run Case A" }).click();
    await expect(page).toHaveURL(/\/deals\/deal_/, { timeout: 30_000 });
    await page.waitForTimeout(1800);
  });
  await shot(page, "deal-live-stream", "A freshly started Case A deal streaming over SSE");

  // --------------------------------------------------------------------- 404
  await page.goto("/does-not-exist");
  await page.waitForTimeout(600);
  await shot(page, "not-found", "404 route");

  const lines = [
    "# Screenshots",
    "",
    "Captured by `pnpm capture` (Playwright) from the running app at 1991×1415,",
    "plus the full 2212×1659 stage. Demo data was reset first, so both cases are fresh.",
    "",
    `Captures: **${manifest.length}** · failed steps: **${failures.length}**`,
    "",
    "| File | What it shows |",
    "| :--- | :--- |",
    ...manifest,
    "",
  ];

  if (failures.length > 0) {
    lines.push("## Steps that did not complete", "", ...failures.map((failure) => `- ${failure}`), "");
  }

  fs.writeFileSync(path.join(DIR, "README.md"), lines.join("\n"));
  expect(failures, failures.join("\n")).toEqual([]);
});
