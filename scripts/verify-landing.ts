import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3111/", { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 250));
    }
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/opencode/landing-bottom.png" });
  await browser.close();
}

main().catch((e) => {
  console.error(String(e).slice(0, 300));
  process.exit(1);
});
