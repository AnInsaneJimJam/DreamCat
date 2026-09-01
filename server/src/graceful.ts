import type { FleetManager } from "./engine.js";
import { emitShutdown } from "./sse.js";

export function registerShutdown(
  fleetManager: FleetManager,
  server: { close: () => void },
): void {
  let shutting = false;

  async function shutdown(signal: string) {
    if (shutting) return;
    shutting = true;
    console.log(`Received ${signal}, shutting down…`);

    const persistPromises: Promise<void>[] = [];
    for (const [, fleet] of fleetManager.fleets) {
      persistPromises.push(fleet.persist(true));
    }
    await Promise.allSettled(persistPromises);
    console.log(`Persisted ${persistPromises.length} fleet(s)`);

    await emitShutdown();

    for (const [, fleet] of fleetManager.fleets) {
      fleet.stop();
    }

    server.close();
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
