import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3111/lab", { waitUntil: "networkidle" });
  await page.selectOption("select", { index: 0 });
  await page.getByText("Start dry-run").click();
  await page.waitForTimeout(50000);
  const log = await page.locator("main section:last-of-type").innerText();
  console.log("=== LOG PANEL ===");
  console.log(log.slice(0, 1200));
  await page.screenshot({ path: "/tmp/opencode/lab-running.png" });
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
