/**
 * 逻辑门图标（ANSI 形状）
 * 用于运算演示与概念速查，保证与电路图里的门完全一致。
 */

import type { GateKind } from "../../core/logic-gates/gates";

export type { GateKind };

const BUBBLE: Record<GateKind, boolean> = {
  AND: false,
  OR: false,
  NOT: true,
  XOR: false,
  NAND: true,
  NOR: true,
  XNOR: true,
  BUFFER: false,
};

function baseOf(kind: GateKind): "AND" | "OR" | "XOR" | "NOT" {
  if (kind === "NAND") return "AND";
  if (kind === "NOR") return "OR";
  if (kind === "XNOR") return "XOR";
  if (kind === "BUFFER") return "NOT";
  return kind;
}

export function GateIcon({
  kind,
  width = 52,
  height = 30,
  high = false,
}: {
  kind: GateKind;
  width?: number;
  height?: number;
  high?: boolean;
}) {
  const base = baseOf(kind);
  const hasBubble = BUBBLE[kind];
  const x0 = 3;
  const y0 = 4;
  const h = height - 8;
  const w = hasBubble ? width - 16 : width - 6;
  const stroke = high ? "var(--accent)" : "var(--line-strong)";
  const fill = high ? "var(--accent-soft)" : "var(--panel-3)";
  const r = h / 2;

  const andPath = `M ${x0} ${y0} L ${x0 + w - r} ${y0} A ${r} ${r} 0 0 1 ${x0 + w - r} ${y0 + h} L ${x0} ${
    y0 + h
  } Z`;
  const orPath = [
    `M ${x0} ${y0}`,
    `Q ${x0 + w * 0.42} ${y0} ${x0 + w} ${y0 + h / 2}`,
    `Q ${x0 + w * 0.42} ${y0 + h} ${x0} ${y0 + h}`,
    `Q ${x0 + w * 0.16} ${y0 + h / 2} ${x0} ${y0}`,
    "Z",
  ].join(" ");

  const bubbleCx = x0 + w + 5;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {base === "NOT" ? (
        <>
          <path
            d={`M ${x0} ${y0} L ${x0 + w - 6} ${y0 + h / 2} L ${x0} ${y0 + h} Z`}
            fill={fill}
            stroke={stroke}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          {hasBubble && (
            <circle cx={bubbleCx} cy={y0 + h / 2} r={3.6} fill={fill} stroke={stroke} strokeWidth={1.3} />
          )}
        </>
      ) : base === "XOR" ? (
        <>
          <path d={orPath} fill={fill} stroke={stroke} strokeWidth={1.3} />
          <path
            d={`M ${x0 - 3} ${y0} Q ${x0 + w * 0.12} ${y0 + h / 2} ${x0 - 3} ${y0 + h}`}
            fill="none"
            stroke={stroke}
            strokeWidth={1.3}
          />
          {hasBubble && (
            <circle cx={bubbleCx} cy={y0 + h / 2} r={3.6} fill={fill} stroke={stroke} strokeWidth={1.3} />
          )}
        </>
      ) : base === "OR" ? (
        <>
          <path d={orPath} fill={fill} stroke={stroke} strokeWidth={1.3} />
          {hasBubble && (
            <circle cx={bubbleCx} cy={y0 + h / 2} r={3.6} fill={fill} stroke={stroke} strokeWidth={1.3} />
          )}
        </>
      ) : (
        <>
          <path d={andPath} fill={fill} stroke={stroke} strokeWidth={1.3} />
          {hasBubble && (
            <circle cx={bubbleCx} cy={y0 + h / 2} r={3.6} fill={fill} stroke={stroke} strokeWidth={1.3} />
          )}
        </>
      )}
    </svg>
  );
}
