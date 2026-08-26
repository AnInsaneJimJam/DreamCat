"use client";

import {
  DEFAULT_EDGE_THRESHOLD,
  DEFAULT_FLATTEN_SEC,
  DEFAULT_MAX_ENTRY_PRICE,
  DEFAULT_MAX_QUOTE_AGE_SEC,
  DEFAULT_QUOTE_SPREAD,
  DEFAULT_SETTLE_SIGMAS,
  DEFAULT_TAPE_WINDOW_SEC,
  DEFAULT_TAU_GATE_SEC,
  type Archetype,
  type StrategyParams,
} from "@/lib/strategy";

export function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 pb-1">
        <label htmlFor={id} className="text-xs text-text-2">
          {label}
        </label>
        <output htmlFor={id} className="num text-xs font-medium text-text-1">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-h-11 w-full cursor-pointer accent-brand"
      />
    </div>
  );
}

interface FieldSpec {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  apply: (v: number) => Partial<StrategyParams>;
}

const pctLabel = (value: number) => `${(value * 100).toFixed(1)}%`;

function orderSizeField(params: StrategyParams): FieldSpec {
  return {
    id: "order-size",
    label: "Order size",
    value: params.orderSize,
    min: 1,
    max: 50,
    step: 1,
    format: (v) => `${v} ctr`,
    apply: (v) => ({ orderSize: v }),
  };
}

function stopLossField(params: StrategyParams): FieldSpec {
  return {
    id: "stop-loss",
    label: "Stop loss",
    value: params.stopLoss,
    min: 0.01,
    max: 0.1,
    step: 0.005,
    format: pctLabel,
    apply: (v) => ({ stopLoss: v }),
  };
}

function takeProfitField(params: StrategyParams): FieldSpec {
  return {
    id: "take-profit",
    label: "Take profit",
    value: params.takeProfit,
    min: 0.01,
    max: 0.15,
    step: 0.005,
    format: pctLabel,
    apply: (v) => ({ takeProfit: v }),
  };
}

function timeStopField(params: StrategyParams): FieldSpec {
  return {
    id: "time-stop",
    label: "Time stop",
    value: params.maxHoldSec,
    min: 30,
    max: 900,
    step: 30,
    format: (v) => `${v}s`,
    apply: (v) => ({ maxHoldSec: v }),
  };
}

export function fieldsFor(archetype: Archetype, params: StrategyParams): FieldSpec[] {
  if (archetype === "fairvalue") {
    return [
      orderSizeField(params),
      {
        id: "model-edge",
        label: "Model edge",
        value: params.edgeThreshold ?? DEFAULT_EDGE_THRESHOLD,
        min: 0.02,
        max: 0.2,
        step: 0.005,
        format: pctLabel,
        apply: (v) => ({ edgeThreshold: v }),
      },
      takeProfitField(params),
      stopLossField(params),
      timeStopField(params),
    ];
  }

  if (archetype === "theta") {
    return [
      orderSizeField(params),
      {
        id: "settle-sigmas",
        label: "Settled distance",
        value: params.settleSigmas ?? DEFAULT_SETTLE_SIGMAS,
        min: 0.5,
        max: 4,
        step: 0.1,
        format: (v) => `${v.toFixed(1)}σ`,
        apply: (v) => ({ settleSigmas: v }),
      },
      {
        id: "max-entry",
        label: "Max entry price",
        value: params.maxEntryPrice ?? DEFAULT_MAX_ENTRY_PRICE,
        min: 0.6,
        max: 0.98,
        step: 0.01,
        format: (v) => `${(v * 100).toFixed(0)}%`,
        apply: (v) => ({ maxEntryPrice: v }),
      },
      {
        id: "tau-gate",
        label: "Entry window",
        value: params.tauGateSec ?? DEFAULT_TAU_GATE_SEC,
        min: 60,
        max: 1800,
        step: 60,
        format: (v) => `last ${Math.round(v / 60)}m`,
        apply: (v) => ({ tauGateSec: v }),
      },
      stopLossField(params),
    ];
  }

  if (archetype === "marketmaker") {
    return [
      orderSizeField(params),
      {
        id: "quote-spread",
        label: "Quote half-width",
        value: params.quoteSpread ?? DEFAULT_QUOTE_SPREAD,
        min: 0.005,
        max: 0.08,
        step: 0.005,
        format: pctLabel,
        apply: (v) => ({ quoteSpread: v }),
      },
      takeProfitField(params),
      stopLossField(params),
      {
        id: "quote-age",
        label: "Quote lifetime",
        value: params.maxQuoteAgeSec ?? DEFAULT_MAX_QUOTE_AGE_SEC,
        min: 15,
        max: 600,
        step: 15,
        format: (v) => `${v}s`,
        apply: (v) => ({ maxQuoteAgeSec: v }),
      },
      {
        id: "flatten-sec",
        label: "Flatten before expiry",
        value: params.flattenSec ?? DEFAULT_FLATTEN_SEC,
        min: 15,
        max: 300,
        step: 15,
        format: (v) => `${v}s`,
        apply: (v) => ({ flattenSec: v }),
      },
      timeStopField(params),
    ];
  }

  return [
    {
      id: "entry-signal",
      label: "Entry signal",
      value: params.entryEdge,
      min: 0.5,
      max: 0.95,
      step: 0.05,
      format: (v) => v.toFixed(2),
      apply: (v) => ({ entryEdge: v }),
    },
    orderSizeField(params),
    takeProfitField(params),
    stopLossField(params),
    {
      id: "tape-lookback",
      label: "Tape lookback",
      value: params.lookback,
      min: 3,
      max: 20,
      step: 1,
      format: (v) => `${v} prints`,
      apply: (v) => ({ lookback: v }),
    },
    {
      id: "tape-window",
      label: "Tape recency",
      value: params.tapeWindowSec ?? DEFAULT_TAPE_WINDOW_SEC,
      min: 60,
      max: 3600,
      step: 60,
      format: (v) => `last ${Math.round(v / 60)}m`,
      apply: (v) => ({ tapeWindowSec: v }),
    },
    timeStopField(params),
  ];
}

export default function StrategyParamFields({
  archetype,
  params,
  idPrefix = "",
  onChange,
}: {
  archetype: Archetype;
  params: StrategyParams;
  idPrefix?: string;
  onChange: (next: StrategyParams) => void;
}) {
  return (
    <>
      {fieldsFor(archetype, params).map((field) => (
        <Slider
          key={field.id}
          id={`${idPrefix}${field.id}`}
          label={field.label}
          value={field.value}
          min={field.min}
          max={field.max}
          step={field.step}
          format={field.format}
          onChange={(value) => onChange({ ...params, ...field.apply(value) })}
        />
      ))}
    </>
  );
}
