import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3111/", { waitUntil: "networkidle" });
  await page.waitForTimeout(6000);
  await page.getByRole("button", { name: "Trend", exact: true }).click();
  const box = await page.locator("div[class*='px-1 pb-1'] canvas").first().boundingBox();
  if (!box) throw new Error("canvas not found");
  const cx = box.x + box.width * 0.3;
  const cy = box.y + box.height * 0.35;
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(400);
  await page.mouse.click(cx + box.width * 0.35, cy - box.height * 0.15);
  await page.waitForTimeout(600);
  await page.screenshot({ path: "/tmp/opencode/drawing.png" });
  await browser.close();
  console.log("drew trend line at", Math.round(cx), Math.round(cy));
}

main().catch((e) => {
  console.error(String(e).slice(0, 300));
  process.exit(1);
});
