import { chromium, type Page } from "playwright";

const PORT = process.env.VERIFY_PORT ?? "3111";
const BASE = `http://localhost:${PORT}`;
const STORAGE_KEY = "dreamcat-fleet-v1";

async function check(label: string, condition: boolean | Promise<boolean>) {
  const ok = await condition;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) process.exitCode = 1;
}

function fleetStatus(page: Page) {
  return page.evaluate(() => document.body.innerText.match(/Running|Paused/)?.[0] ?? "?");
}

async function openFleet(page: Page) {
  await page.goto(`${BASE}/fleet`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelectorAll("#fleet-market option").length > 0,
    undefined,
    { timeout: 90_000 },
  );
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  await openFleet(page);
  await page.getByRole("button", { name: "Add to fleet" }).click();
  await page.getByRole("button", { name: "Deploy" }).click();
  await page.waitForTimeout(4_000);
  await check("fleet reports Running after deploy", (await fleetStatus(page)) === "Running");

  await page.getByRole("link", { name: "Board" }).first().click();
  await page.waitForURL("**/leaderboard", { timeout: 20_000 });
  await page.waitForTimeout(8_000);
  await page.getByRole("link", { name: "Fleet" }).first().click();
  await page.waitForURL("**/fleet", { timeout: 20_000 });
  await page.waitForTimeout(3_000);
  await check("runner survives navigation to /board and back", (await fleetStatus(page)) === "Running");
  await check("the cat is still in the fleet", (await page.locator("article").count()) > 0);

  const persisted = await page.evaluate((key) => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "{}") as { running?: boolean; cats?: unknown[] };
    } catch {
      return {};
    }
  }, STORAGE_KEY);
  await check("run state is persisted", persisted.running === true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5_000);
  await check("still Running after a full page reload", (await fleetStatus(page)) === "Running");

  await page.getByRole("button", { name: "Stop" }).click();
  await page.waitForTimeout(2_000);
  await check("Stop pauses the fleet", (await fleetStatus(page)) === "Paused");

  await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key) ?? "{}") as {
      cats?: { sim?: Record<string, unknown> }[];
    };
    for (const cat of raw.cats ?? []) {
      if (cat.sim) cat.sim.position = { side: "YES", entryPrice: 0.42, size: 5, openedAt: Date.now() - 900_000 };
    }
    localStorage.setItem(key, JSON.stringify(raw));
  }, STORAGE_KEY);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5_000);

  const afterRestore = await page.evaluate(() => ({
    notice: document.body.innerText.includes("cleared on reload"),
    stillOpen: /YES @ 42\.0%/.test(document.body.innerText),
  }));
  await check("a stale open position is cleared on reload", !afterRestore.stillOpen);
  await check("the cleared position is reported to the trader", afterRestore.notice);

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
