import { watchServerBook, watchServerFills } from "./sdk.js";
import type { BookSnapshot, Fill } from "./types.js";

interface MarketSubscription {
  marketId: string;
  yesSymbol: string;
  book: BookSnapshot;
  fills: Fill[];
  subscribers: Set<string>;
  stopBook: () => void;
  stopFills: () => void;
}

type UpdateCallback = (marketId: string, book: BookSnapshot, fills: Fill[]) => void;

const subscriptions = new Map<string, MarketSubscription>();
const updateListeners = new Set<UpdateCallback>();

const EMPTY_BOOK: BookSnapshot = {
  bids: [],
  asks: [],
  bidDepth: 0,
  askDepth: 0,
  mid: null,
  spread: null,
  imbalance: null,
};

const MAX_FILLS = 20;

function notifyListeners(marketId: string, book: BookSnapshot, fills: Fill[]): void {
  for (const cb of updateListeners) {
    try {
      cb(marketId, book, fills);
    } catch {}
  }
}

export function subscribeMarket(marketId: string, yesSymbol: string, userId: string): void {
  let sub = subscriptions.get(marketId);
  if (sub) {
    sub.subscribers.add(userId);
    return;
  }

  sub = {
    marketId,
    yesSymbol,
    book: EMPTY_BOOK,
    fills: [],
    subscribers: new Set([userId]),
    stopBook: () => {},
    stopFills: () => {},
  };

  sub.stopBook = watchServerBook(yesSymbol, (book) => {
    const s = subscriptions.get(marketId);
    if (!s) return;
    s.book = book;
    notifyListeners(marketId, s.book, s.fills);
  });

  sub.stopFills = watchServerFills(yesSymbol, (fills) => {
    const s = subscriptions.get(marketId);
    if (!s) return;
    s.fills = fills.slice(0, MAX_FILLS);
    notifyListeners(marketId, s.book, s.fills);
  });

  subscriptions.set(marketId, sub);
}

export function unsubscribeMarket(marketId: string, userId: string): void {
  const sub = subscriptions.get(marketId);
  if (!sub) return;
  sub.subscribers.delete(userId);
  if (sub.subscribers.size > 0) return;
  sub.stopBook();
  sub.stopFills();
  subscriptions.delete(marketId);
}

export function getMarketData(marketId: string): { book: BookSnapshot; fills: Fill[] } | null {
  const sub = subscriptions.get(marketId);
  if (!sub) return null;
  return { book: sub.book, fills: sub.fills };
}

export function onMarketUpdate(cb: UpdateCallback): () => void {
  updateListeners.add(cb);
  return () => {
    updateListeners.delete(cb);
  };
}

export function getActiveSubscriptionCount(): number {
  return subscriptions.size;
}
