import { test, expect, type Page } from "@playwright/test";

async function enter(page: Page) {
  const entry = page.getByRole("button", { name: "Enter constellation", exact: true });
  await expect(entry).toBeEnabled();
  await entry.click();
  await expect(page.locator('main[data-phase="explore"]')).toBeVisible();
  await expect(page.getByLabel("Select an evaluated gene pair")).toBeVisible();
}

test("intro hub enters the 3D scene; compact views retain measured data and modes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.getByRole("button", { name: "Enter constellation", exact: true })).toBeEnabled();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Scientist mode" })).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: /CRISPR.*Constellation/ })).toBeVisible();
  await expect(page.getByText("Machine learning × cellular biology", { exact: true })).toHaveCount(0);
  await expect(page.locator(".intro-description")).toHaveText("Predicting how cells respond to gene activation with machine learning.");
  await expect(page.locator(".intro-skills")).toHaveCount(0);
  await expect(page.locator(".intro-index")).toHaveCount(0);
  await expect(page.getByText(/CRISPR Constellation.*Ryan Zheng/)).toBeVisible();
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
  await expect(page.getByRole("complementary", { name: "All evaluated pairs" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("navigation")).toBeVisible();
  const panel = await page.getByRole("complementary").boundingBox();
  expect(panel!.width).toBeLessThan(450);
  await page.getByLabel("Filter pair results").selectOption("gears");
  await expect(page.locator("#results tbody tr")).toHaveCount(3);
  await page.getByLabel("Search evaluated gene pairs").fill("not-a-real-gene");
  await expect(page.getByText("No saved pairs match your search.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "ETS2 and MAPK1" })).toBeVisible();
  await page.getByRole("button", { name: "Methods", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Additive led overall", exact: true })).toBeVisible();
  await expect(page.getByText(/GEARS · 29,766 sampled outcome cells/)).toBeVisible();
  await page.getByText("Evaluation & limits", { exact: true }).click();
  await expect(page.getByText(/previously inspected test set/)).toBeVisible();
  await page.getByRole("button", { name: "← Explorer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ETS2 and MAPK1" })).toBeVisible();
  await page.getByRole("button", { name: "← Intro", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enter constellation", exact: true })).toBeEnabled();
  await enter(page);
  await expect(page.getByRole("heading", { name: "ETS2 and MAPK1" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("DNA cursor leaves entry clickable; keyboard re-entry preserves the selected scientific view", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("./");
  const entry = page.getByRole("button", { name: "Enter constellation", exact: true });
  await expect(entry).toBeEnabled();
  const bounds = (await entry.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page.locator(".dna-cursor")).toHaveAttribute("data-visible", "true");
  await expect(page.locator(".dna-cursor")).toHaveAttribute("data-action", "true");
  const unobstructed = await entry.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  });
  expect(unobstructed).toBe(true);
  await enter(page);
  await page.getByLabel("Select an evaluated gene pair").selectOption("IGDCC3+PRTG");
  await page.getByRole("switch", { name: "Scientist mode" }).click();
  // Orbit uses the actual canvas; decorative stars never intercept its input.
  await page.mouse.move(450, 420);
  await page.mouse.down();
  await page.mouse.move(550, 455, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole("heading", { name: "IGDCC3 and PRTG" })).toBeVisible();
  await page.getByRole("button", { name: "← Intro", exact: true }).click();
  await expect(entry).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('main[data-phase="explore"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "IGDCC3 and PRTG" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Scientist mode" })).toBeChecked();
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
  const thumbInsideTrack = await page.getByRole("switch", { name: "Scientist mode" }).evaluate((element) => {
    const track = element.getBoundingClientRect();
    const thumb = element.querySelector("span")!.getBoundingClientRect();
    return thumb.left >= track.left && thumb.right <= track.right;
  });
  expect(thumbInsideTrack).toBe(true);
  const overflow = await page.evaluate(() => ({ x: document.documentElement.scrollWidth > window.innerWidth, y: document.documentElement.scrollHeight > window.innerHeight }));
  expect(overflow).toEqual({ x: false, y: false });
  await page.getByRole("button", { name: "Methods", exact: true }).click();
  await expect(page.getByRole("heading", { name: "The experiment." })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("navigation")).toBeVisible();
  await page.getByRole("button", { name: "← Explorer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "CEBPA and CEBPB" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Scientist mode" })).toBeChecked();
});

test("touch devices retain native input while entering the constellation", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(process.env.DASHBOARD_TEST_URL || "http://127.0.0.1:3016");
  const entry = page.getByRole("button", { name: "Enter constellation", exact: true });
  await expect(entry).toBeEnabled();
  await entry.tap();
  await expect(page.locator('main[data-phase="explore"]')).toBeVisible();
  await expect(page.locator(".dna-cursor")).toHaveAttribute("data-visible", "false");
  await page.getByLabel("Select an evaluated gene pair").selectOption("IGDCC3+PRTG");
  await expect(page.getByRole("heading", { name: "IGDCC3 and PRTG" })).toBeVisible();
  await context.close();
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


test("help, definitions and guided examples preserve the explorer state", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await enter(page);
  await page.getByRole("button", { name: "GEARS closer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "IGDCC3 and PRTG" })).toBeVisible();
  const mse = page.getByRole("button", { name: "MSE", exact: true });
  await mse.focus();
  await expect(page.getByRole("tooltip", { name: /MSE · mean squared prediction error/ })).toBeVisible();
  await mse.press("Escape");
  await expect(page.getByRole("tooltip", { name: /MSE · mean squared prediction error/ })).not.toBeVisible();
  await page.getByRole("switch", { name: "Scientist mode" }).click();
  await page.getByRole("button", { name: "Instructions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Explore a response." })).toBeVisible();
  await page.getByRole("button", { name: "← Explorer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "IGDCC3 and PRTG" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Scientist mode" })).toBeChecked();
  await page.getByRole("button", { name: "Pairs", exact: true }).click();
  await page.getByRole("button", { name: "Additive closer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ETS2 and MAPK1" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Scientist mode" })).toBeChecked();
});


test("Enter starts the camera journey; Scientist diagnostics preserve signed measured errors", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await expect(page.getByRole("button", { name: "Enter constellation", exact: true })).toBeEnabled();
  await page.keyboard.press("Enter");
  await expect(page.locator('main[data-phase="explore"]')).toBeVisible();
  await page.getByLabel("Select an evaluated gene pair").selectOption("IGDCC3+PRTG");
  await expect(page.locator("main")).toHaveAttribute("data-mode", "explorer");
  await page.getByRole("switch", { name: "Scientist mode" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-mode", "scientist");
  await expect(page.getByText("GEARS · 71.4% lower MSE vs. additive", { exact: true })).toBeVisible();
  await expect(page.locator(".rmse-readout dd").nth(0)).toHaveText("0.4365");
  await expect(page.locator(".rmse-readout dd").nth(1)).toHaveText("0.2336");
  await page.getByRole("button", { name: "Residuals", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Prediction residuals", exact: true })).toBeVisible();
  await expect(page.getByText(/Above zero · overprediction/)).toBeVisible();
  const firstError = page.locator(".residual-table tbody tr").first();
  await expect(page.locator(".residual-table tbody tr")).toHaveCount(3);
  await expect(firstError.locator("th")).toHaveText("IGDCC3");
  await expect(firstError.locator("td").nth(0)).toHaveText("-0.005");
  await expect(firstError.locator("td").nth(1)).toHaveText("-0.891");
  await page.getByLabel("Select an evaluated gene pair").selectOption("ETS2+MAPK1");
  await expect(page.getByText("GEARS · 362.7% higher MSE vs. additive", { exact: true })).toBeVisible();
  await page.getByRole("switch", { name: "Scientist mode" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-mode", "explorer");
  await expect(page.getByRole("button", { name: "Residuals", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "ETS2 and MAPK1" })).toBeVisible();
});
