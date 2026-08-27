type SettlementRailProps = {
  probability: number;
  size?: "sm" | "lg";
  showScale?: boolean;
};

export function SettlementRail({ probability, size = "lg", showScale = true }: SettlementRailProps) {
  const pct = Math.min(100, Math.max(0, probability * 100));
  const leaning = pct >= 50;
  const from = Math.min(50, pct);
  const width = Math.abs(pct - 50);
  const large = size === "lg";

  return (
    <div className="w-full">
      <div className={`relative ${large ? "h-8" : "h-5"}`}>
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong"
        />
        <div
          aria-hidden="true"
          className={`absolute top-1/2 h-px -translate-y-1/2 ${leaning ? "bg-buy" : "bg-sell"}`}
          style={{ left: `${from}%`, width: `${width}%` }}
        />
        <div
          aria-hidden="true"
          className={`absolute top-1/2 w-px -translate-y-1/2 bg-line-strong ${large ? "h-3" : "h-2"}`}
          style={{ left: "50%" }}
        />
        {[0, 100].map((edge) => (
          <div
            aria-hidden="true"
            className={`absolute top-1/2 w-px -translate-y-1/2 bg-line-strong ${large ? "h-4" : "h-2.5"}`}
            key={edge}
            style={{ left: `${edge}%` }}
          />
        ))}
        <div
          aria-hidden="true"
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-canvas transition-[left] duration-700 ease-terminal ${
            large ? "h-3 w-3" : "h-2 w-2"
          } ${leaning ? "bg-buy" : "bg-sell"}`}
          style={{ left: `${pct}%` }}
        />
      </div>
      {showScale ? (
        <div className="mt-1 flex items-center justify-between">
          <span className="num text-[10px] font-semibold uppercase tracking-[0.16em] text-sell">No · 0</span>
          <span className="num text-[10px] uppercase tracking-[0.16em] text-text-3">settles at one end</span>
          <span className="num text-[10px] font-semibold uppercase tracking-[0.16em] text-buy">100 · Yes</span>
        </div>
      ) : null}
    </div>
  );
}
