import { test, expect } from "@playwright/test";

test("measured data, pair selection, and both modes stay consistent", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.getByText("29,766", { exact: true })).toBeVisible();
  await expect(page.getByText("0.0602", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("0.1638", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "IGDCC3 and PRTG" })).toBeVisible();
  await page.getByRole("switch", { name: "Scientist mode" }).click();
  await expect(page.getByRole("heading", { name: "IGDCC3 and PRTG" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Prediction error", exact: true })).toBeVisible();
  await page.getByLabel("Select an evaluated gene pair").selectOption("ETS2+MAPK1");
  await expect(page.getByRole("heading", { name: "ETS2 and MAPK1" })).toBeVisible();
  await expect(page).toHaveURL(/pair=ETS2%2BMAPK1/);
  await expect(page.getByText("Additive has the lower prediction error for this pair.")).toBeVisible();
  await page.getByRole("button", { name: "View all gene values" }).click();
  const expressionTable = page.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "Observed", exact: true }) });
  await expect(expressionTable.locator("tbody tr")).toHaveCount(20);
  await page.getByRole("switch", { name: "Scientist mode" }).click();
  await expect(page.getByRole("heading", { name: "ETS2 and MAPK1" })).toBeVisible();
  await page.getByLabel("Filter pair results").selectOption("gears");
  await expect(page.locator("#results tbody tr")).toHaveCount(3);
  await page.getByLabel("Search evaluated gene pairs").fill("not-a-real-gene");
  await expect(page.getByText("No saved pairs match your search.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("unsupported combinations have no invented result", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByText("29,766", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "Choose genes", exact: true }).click();
  const first = page.getByRole("button", { name: "BPGM", exact: true });
  await first.focus();
  await first.click();
  const second = page.getByRole("button", { name: "MAPK1", exact: true });
  await second.focus();
  await second.click();
  await expect(page.getByRole("heading", { name: "This pair has no evaluated result here." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How the genes responded" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "This pair has no evaluated result here." })).toBeVisible();
});

test("mobile and reduced-motion layouts remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await expect(page.getByText("29,766", { exact: true })).toBeVisible();
  await page.getByLabel("Select an evaluated gene pair").selectOption("CEBPA+CEBPB");
  await expect(page.getByRole("heading", { name: "CEBPA and CEBPB" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset gene-pair graph view" })).toBeVisible();
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflows).toBe(false);
});

test("data failure has a working retry", async ({ page }) => {
  let fail = true;
  await page.route("**/data/results.json", (route) => fail ? route.fulfill({ status: 503, body: "Unavailable" }) : route.continue());
  await page.goto("./");
  await expect(page.getByRole("alert").filter({ has: page.getByRole("heading", { name: "The saved results couldn’t be loaded." }) })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("29,766", { exact: true })).toBeVisible();
});
