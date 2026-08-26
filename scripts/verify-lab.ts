import { chromium, type Page } from "playwright";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function assertReset(page: Page, context: string) {
  const startButton = page.getByRole("button", { name: "Start dry run", exact: true });
  assert((await startButton.getAttribute("aria-pressed")) === "false", `${context}: dry run was not stopped`);
  const text = await page.locator("main").innerText();
  assert(text.includes("+0.00 tUSDC"), `${context}: paper equity was not reset`);
  assert(text.includes("0 trades"), `${context}: trade count was not reset`);
  assert(text.includes("0W / 0L"), `${context}: win/loss count was not reset`);
  const log = await page.getByRole("log").innerText();
  assert(log.includes("Start a dry run to see simulated orders here."), `${context}: execution log was not reset`);
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto("http://localhost:3111/lab", { waitUntil: "domcontentloaded" });
    const marketSelect = page.locator("select#target-market");
    await marketSelect.waitFor({ state: "visible", timeout: 30000 });
    const marketCount = await marketSelect.locator("option").count();
    assert(marketCount > 0, "market selector has no live options");

    const startButton = page.getByRole("button", { name: /^(Start|Stop) dry run$/ });
    await startButton.click();
    assert((await startButton.getAttribute("aria-pressed")) === "true", "dry run did not start");

    await page.getByRole("button", { name: /Whiskers/ }).click();
    await assertReset(page, "archetype change");

    if (marketCount > 1) {
      await startButton.click();
      assert((await startButton.getAttribute("aria-pressed")) === "true", "dry run did not restart");
      await marketSelect.selectOption({ index: 1 });
      await assertReset(page, "market change");
    } else {
      console.log("market change check skipped: fewer than two live markets");
    }

    console.log("lab state-isolation verification: all assertions passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
