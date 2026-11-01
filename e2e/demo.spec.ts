import { expect, test } from "@playwright/test";

const API = "http://127.0.0.1:8787";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  // Deterministic starting point: wipe generated evidence and rebuild both cases.
  const response = await request.post(`${API}/api/demo/reset`);
  expect(response.ok(), `reset failed: ${response.status()} ${await response.text()}`).toBeTruthy();
});

test("Case A settles and the receipt verifies in the browser", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Run Case A/ }).click();
  await expect(page).toHaveURL(/\/deals\/deal_/, { timeout: 30_000 });

  // The pipeline runs handshake → negotiation → capture → dual signature.
  const verify = page.getByRole("button", { name: "Verify in browser" });
  await expect(verify).toBeVisible({ timeout: 60_000 });
  await verify.click();
  await expect(page.getByText("Chain and receipt digest agree.")).toBeVisible();

  // The guard allowed the purchase and the handshake says so.
  await expect(page.getByText("ACCEPTED", { exact: true })).toBeVisible();
  await expect(page.getByText(/ALLOW · M-OK-00/).first()).toBeVisible();
});

test("Case B records the bypass and the arbiter rules against the agent", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Run Case B/ }).click();
  await expect(page).toHaveURL(/\/deals\/deal_/, { timeout: 30_000 });

  await expect(page.getByText("Demo misconfiguration")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/BYPASSED · DEMO-BYPASS-00/).first()).toBeVisible({ timeout: 60_000 });

  // The court must carry the verdict for both cases side by side.
  await page.goto("/disputes");
  await expect(page.getByRole("heading", { name: /^Case A/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Case B/ })).toBeVisible();
  await expect(page.getByText("BUYER_AGENT_OUT_OF_MANDATE").first()).toBeVisible();
  await expect(page.getByText("VALID_PURCHASE").first()).toBeVisible();

  const disputes = await request.get(`${API}/api/disputes`);
  expect(disputes.ok()).toBeTruthy();
  const body = (await disputes.json()) as { disputes: Array<{ caseLabel: string | null; dispute: { ruling: { verdict: string } | null } }> };
  const caseB = body.disputes.find((entry) => entry.caseLabel === "B");
  expect(caseB?.dispute.ruling?.verdict).toBe("BUYER_AGENT_OUT_OF_MANDATE");
});

test("The ledger tamper control names the exact broken entry", async ({ page }) => {
  await page.goto("/ledger");
  await expect(page.getByText("Evidence integrity")).toBeVisible();
  await page.getByRole("button", { name: /Flip one byte in #0/ }).click();
  await expect(page.getByText(/^First break: entry #0$/)).toBeVisible();
  await expect(page.getByText(/^broken at #0$/)).toBeVisible();
  await expect(page.getByText(/payloadHash mismatch at index 0/).first()).toBeVisible();
});
