import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3111/fleet", { waitUntil: "networkidle" });

  await page.selectOption("select >> nth=0", { index: 1 });
  await page.getByText("+ Add to fleet").click();
  await page.selectOption("select >> nth=0", { index: 2 });
  await page.selectOption("select >> nth=1", { index: 3 });
  await page.getByText("+ Add to fleet").click();

  await page.getByText("Deploy fleet").click();
  await page.waitForTimeout(45000);
  await page.screenshot({ path: "/tmp/opencode/fleet-running.png" });
  const header = await page.locator("header").innerText();
  console.log("=== HEADER ===");
  console.log(header.replace(/\n/g, " | "));
  const cards = await page.locator("main > div >> nth=0").innerText();
  console.log("=== CARDS ===");
  console.log(cards.slice(0, 900).replace(/\n+/g, " | "));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
