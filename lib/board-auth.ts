export const SIGNATURE_TTL_MS = 5 * 60 * 1000;

export function publishMessage(nonce: number, catName: string): string {
  return `DreamCat board: publish "${catName}" at ${nonce}`;
}

export function deleteMessage(id: string, nonce: number): string {
  return `DreamCat board: delete entry ${id} at ${nonce}`;
}

export function freshNonce(nonce: unknown): nonce is number {
  return (
    typeof nonce === "number" && Number.isFinite(nonce) && Math.abs(Date.now() - nonce) < SIGNATURE_TTL_MS
  );
}
