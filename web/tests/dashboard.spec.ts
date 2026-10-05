import { test, expect, type Page } from "@playwright/test";

async function enter(page: Page) {
  const entry = page.getByRole("button", { name: "Enter constellation", exact: true });
  await expect(entry).toBeEnabled();
  await entry.click();
  await expect(page.locator('main[data-phase="explore"]')).toBeVisible();
  await expect(page.getByLabel("Select an evaluated gene pair")).toBeVisible();
}

test("quiet intro enters the 3D scene; measured data and modes remain consistent", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.getByRole("button", { name: "Enter constellation", exact: true })).toBeEnabled();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Scientist mode" })).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(1);
  await enter(page);
  await expect(page.getByRole("heading", { name: "Choose two genes." })).toBeVisible();
  await page.getByLabel("Select an evaluated gene pair").selectOption("IGDCC3+PRTG");
  await expect(page.getByRole("heading", { name: "IGDCC3 and PRTG" })).toBeVisible();
  await page.getByRole("switch", { name: "Scientist mode" }).click();
  await expect(page.getByRole("heading", { name: "IGDCC3 and PRTG" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Prediction error", exact: true })).toBeVisible();
  await page.getByLabel("Select an evaluated gene pair").selectOption("ETS2+MAPK1");
  await expect(page.getByRole("heading", { name: "ETS2 and MAPK1" })).toBeVisible();
  await expect(page).toHaveURL(/pair=ETS2%2BMAPK1/);
  await expect(page.getByText("Additive has the lower prediction error for this pair.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "View all gene values" }).click();
  const values = page.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "Observed", exact: true }) });
  await expect(values.locator("tbody tr")).toHaveCount(20);
  await page.getByRole("switch", { name: "Scientist mode" }).click();
  await expect(page.getByRole("heading", { name: "ETS2 and MAPK1" })).toBeVisible();
  await page.getByRole("button", { name: "Pairs", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "All evaluated pairs" })).toBeVisible();
  await page.getByLabel("Filter pair results").selectOption("gears");
  await expect(page.locator("#results tbody tr")).toHaveCount(3);
  await page.getByLabel("Search evaluated gene pairs").fill("not-a-real-gene");
  await expect(page.getByText("No saved pairs match your search.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Methods", exact: true }).click();
  await expect(page.getByText("The baseline led overall", { exact: true })).toBeVisible();
  await expect(page.getByText(/GEARS learned from 29,766/)).toBeVisible();
  await page.getByRole("button", { name: "Close drawer" }).click();
  expect(errors).toEqual([]);
});

test("unsupported combinations remain honest and survive a shared-link reload", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await enter(page);
  await page.getByRole("button", { name: "Choose genes", exact: true }).click();
  await page.getByRole("button", { name: "BPGM", exact: true }).click();
  await expect(page.getByRole("button", { name: "SAMD1", exact: true })).toHaveAttribute("data-partner", "true");
  await page.getByRole("button", { name: "MAPK1", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No saved result." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How the genes responded" })).toHaveCount(0);
  await page.reload();
  await enter(page);
  await expect(page.getByRole("heading", { name: "No saved result." })).toBeVisible();
});

test("mobile and reduced-motion keep the scene in one viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await enter(page);
  await page.getByLabel("Select an evaluated gene pair").selectOption("CEBPA+CEBPB");
  await expect(page.getByRole("heading", { name: "CEBPA and CEBPB" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset gene-pair graph view" })).toBeVisible();
  await page.getByRole("switch", { name: "Scientist mode" }).click();
  await expect(page.getByRole("heading", { name: "Prediction error", exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => ({ x: document.documentElement.scrollWidth > window.innerWidth, y: document.documentElement.scrollHeight > window.innerHeight }));
  expect(overflow).toEqual({ x: false, y: false });
});

test("failed data has a working retry before entry", async ({ page }) => {
  let fail = true;
  await page.route("**/data/results.json", (route) => fail ? route.fulfill({ status: 503, body: "Unavailable" }) : route.continue());
  await page.goto("./");
  await expect(page.getByRole("alert").filter({ has: page.getByRole("heading", { name: "The saved results couldn’t be loaded." }) })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await enter(page);
  await expect(page.getByRole("heading", { name: "Choose two genes." })).toBeVisible();
});
