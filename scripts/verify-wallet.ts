import { chromium, type Page } from "playwright";

const PORT = process.env.VERIFY_PORT ?? "3111";
const URL = `http://localhost:${PORT}/terminal`;
const SHANNON_HEX = "0xc488";

const mockWallet = `
(() => {
  const store = window.sessionStorage;
  const read = (key, fallback) => {
    const raw = store.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  };
  const write = (key, value) => store.setItem(key, JSON.stringify(value));
  const state = {
    chainId: read("mock:chainId", "0x1"),
    authorized: read("mock:authorized", false),
    account: "0x1111111111111111111111111111111111111111",
    addCalls: read("mock:addCalls", 0),
    switchCalls: read("mock:switchCalls", 0),
  };
  const listeners = new Map();
  const emit = (event, payload) => {
    for (const listener of listeners.get(event) ?? []) listener(payload);
  };
  const provider = {
    isMockWallet: true,
    request: async ({ method, params }) => {
      if (method === "eth_requestAccounts") {
        state.authorized = true;
        write("mock:authorized", true);
        return [state.account];
      }
      if (method === "eth_accounts") return state.authorized ? [state.account] : [];
      if (method === "eth_chainId") return state.chainId;
      if (method === "wallet_switchEthereumChain") {
        state.switchCalls += 1;
        write("mock:switchCalls", state.switchCalls);
        if (state.knownChains === undefined) state.knownChains = read("mock:knownChains", ["0x1"]);
        const target = params[0].chainId;
        if (!state.knownChains.includes(target)) {
          const error = new Error("Unrecognized chain ID. Try adding the chain first.");
          error.code = 4902;
          throw error;
        }
        state.chainId = target;
        write("mock:chainId", target);
        emit("chainChanged", target);
        return null;
      }
      if (method === "wallet_addEthereumChain") {
        state.addCalls += 1;
        write("mock:addCalls", state.addCalls);
        state.knownChains = [...read("mock:knownChains", ["0x1"]), params[0].chainId];
        write("mock:knownChains", state.knownChains);
        return null;
      }
      throw new Error("Unsupported method " + method);
    },
    on: (event, listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    },
    removeListener: (event, listener) => {
      listeners.set(event, (listeners.get(event) ?? []).filter((entry) => entry !== listener));
    },
  };
  window.__mockWallet = {
    setChain: (chainId) => {
      state.chainId = chainId;
      write("mock:chainId", chainId);
      emit("chainChanged", chainId);
    },
    setAccounts: (accounts) => {
      state.authorized = accounts.length > 0;
      write("mock:authorized", state.authorized);
      emit("accountsChanged", accounts);
    },
    counts: () => ({ addCalls: read("mock:addCalls", 0), switchCalls: read("mock:switchCalls", 0) }),
  };
  const detail = Object.freeze({
    info: { uuid: "11111111-2222-3333-4444-555555555555", name: "Mock Wallet", rdns: "dev.dreamcat.mock", icon: "" },
    provider,
  });
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
  window.__mockProvider = provider;
  window.__mockAnnounce = announce;
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();
`;

function walletButton(page: Page) {
  return page.getByRole("button", { name: /Connect wallet|Disconnect wallet/ }).first();
}

async function expect(label: string, condition: boolean | Promise<boolean>) {
  const ok = await condition;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) process.exitCode = 1;
}

interface MockWallet {
  setChain: (chainId: string) => void;
  setAccounts: (accounts: string[]) => void;
  counts: () => { addCalls: number; switchCalls: number };
}

async function waitForConnected(page: Page) {
  await page.waitForFunction(
    () => /0x1111/i.test(document.querySelector("[aria-label^='Disconnect wallet']")?.textContent ?? ""),
    undefined,
    { timeout: 25_000 },
  );
}

function switchButton(page: Page) {
  return page.getByRole("button", { name: "Switch to Somnia Shannon" }).first();
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(mockWallet);

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await walletButton(page).waitFor({ state: "visible", timeout: 30_000 });
  await expect("starts disconnected", (await walletButton(page).innerText()).includes("Connect wallet"));

  await walletButton(page).click();
  await waitForConnected(page);
  await expect("connect from a foreign chain reaches a connected state", true);

  const counts = await page.evaluate(() => (window as unknown as { __mockWallet: MockWallet }).__mockWallet.counts());
  await expect("connecting from a foreign chain requests a network switch", counts.switchCalls > 0);
  await expect("adds Somnia Shannon when the wallet does not know it", counts.addCalls > 0);
  await expect("no wrong-network prompt after connecting", (await switchButton(page).count()) === 0);

  await page.reload({ waitUntil: "domcontentloaded" });
  await walletButton(page).waitFor({ state: "visible", timeout: 30_000 });
  await waitForConnected(page);
  await expect("restores the connection after a reload", true);

  await page.evaluate(() => (window as unknown as { __mockWallet: MockWallet }).__mockWallet.setChain("0x1"));
  await switchButton(page).first().waitFor({ state: "visible", timeout: 10_000 });
  await expect("shows a switch prompt when the wallet leaves Shannon", true);

  await switchButton(page).click();
  await switchButton(page).waitFor({ state: "detached", timeout: 20_000 });
  const finalChain = await page.evaluate(() => window.sessionStorage.getItem("mock:chainId"));
  await expect("switch prompt returns the wallet to Shannon", finalChain === `"${SHANNON_HEX}"`);

  await page.evaluate(() => (window as unknown as { __mockWallet: MockWallet }).__mockWallet.setAccounts([]));
  await page.waitForFunction(
    () => (document.querySelector("[aria-label='Connect wallet']")?.textContent ?? "").includes("Connect wallet"),
    undefined,
    { timeout: 10_000 },
  );
  await expect("locking the wallet clears the connected state", true);

  const legacy = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const legacyPage = await legacy.newPage();
  await legacyPage.addInitScript(`${mockWallet}\nwindow.ethereum = window.__mockProvider;\nwindow.removeEventListener("eip6963:requestProvider", window.__mockAnnounce);`);
  await legacyPage.goto(URL, { waitUntil: "domcontentloaded" });
  await walletButton(legacyPage).waitFor({ state: "visible", timeout: 30_000 });
  await walletButton(legacyPage).click();
  await waitForConnected(legacyPage);
  await expect("connects through a legacy window.ethereum wallet", true);
  await legacy.close();

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
