import type { GateKind } from "../../core/logic-gates/gates";
import { GATES } from "../../core/logic-gates/gates";

/**
 * 逻辑门工程符号（ANSI/IEEE 形状）
 *
 * 与 GateIcon 的区别：这里画的是「符号图」而不是「小图标」——
 * 带输入/输出端子、端名、按比例缩放的反相圈，用于符号百科与门级实验。
 *
 * 形状约定：
 *   AND/NAND  D 形（左侧平直、右侧半圆）
 *   OR/NOR    盾形（左侧内凹、右侧尖）
 *   XOR/XNOR   盾形 + 左侧第二条弧线
 *   NOT/BUFFER 三角形
 *   取反       一律在输出端画小圆圈，而不是改形状
 */

const VIEW_W = 260;
const VIEW_H = 140;
const TOP = 30;
const BOTTOM = 110;
const MID = (TOP + BOTTOM) / 2;
const LEFT = 40;
const PORT_IN = 12;
const PORT_OUT = 236;

function geometry(kind: GateKind) {
  const base = kind === "NAND" ? "AND" : kind === "NOR" ? "OR" : kind === "XNOR" ? "XOR" : kind;
  const bubble = kind === "NAND" || kind === "NOR" || kind === "XNOR" || kind === "NOT";
  const edge = base === "AND" ? 136 : base === "NOT" || base === "BUFFER" ? 124 : 150;
  const radius = base === "AND" ? (BOTTOM - TOP) / 2 : 0;
  const andPath = `M ${LEFT} ${TOP} L ${edge - radius} ${TOP} A ${radius} ${radius} 0 0 1 ${
    edge - radius
  } ${BOTTOM} L ${LEFT} ${BOTTOM} Z`;
  const orPath = [
    `M ${LEFT} ${TOP}`,
    `Q ${LEFT + 44} ${TOP} ${edge} ${MID}`,
    `Q ${LEFT + 44} ${BOTTOM} ${LEFT} ${BOTTOM}`,
    `Q ${LEFT + 18} ${MID} ${LEFT} ${TOP}`,
    "Z",
  ].join(" ");
  const triPath = `M ${LEFT} ${TOP} L ${edge} ${MID} L ${LEFT} ${BOTTOM} Z`;
  return { base, bubble, edge, andPath, orPath, triPath, radius };
}

export function GateSymbol({
  kind,
  active = false,
  highInputs = [],
  ariaLabel,
}: {
  kind: GateKind;
  /** 输出为 1 时整条通路点亮 */
  active?: boolean;
  /** 当前为 1 的输入端，用于给对应引线着色 */
  highInputs?: string[];
  ariaLabel?: string;
}) {
  const meta = GATES[kind];
  const g = geometry(kind);
  const stroke = active ? "var(--accent)" : "var(--line-strong)";
  const fill = active ? "var(--accent-soft)" : "var(--panel-3)";
  const wire = (hot: boolean) => (hot ? "var(--accent)" : "var(--line-strong)");

  const inputY = meta.arity === 1 ? [MID] : [52, 88];
  const inputNames = meta.arity === 1 ? ["A"] : ["A", "B"];

  const bubbleCx = g.edge + 8;
  const outStart = g.bubble ? bubbleCx + 8 : g.edge;

  const shape =
    g.base === "AND" ? (
      <path d={g.andPath} fill={fill} stroke={stroke} strokeWidth={1.8} strokeLinejoin="round" />
    ) : g.base === "NOT" || g.base === "BUFFER" ? (
      <path d={g.triPath} fill={fill} stroke={stroke} strokeWidth={1.8} strokeLinejoin="round" />
    ) : (
      <>
        <path d={g.orPath} fill={fill} stroke={stroke} strokeWidth={1.8} strokeLinejoin="round" />
        {g.base === "XOR" && (
          <path
            d={`M ${LEFT - 12} ${TOP} Q ${LEFT + 8} ${MID} ${LEFT - 12} ${BOTTOM}`}
            fill="none"
            stroke={stroke}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        )}
      </>
    );

  return (
    <svg
      className="gate-symbol"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={ariaLabel ?? `${meta.zh}（${meta.en}）的电路符号`}
    >
      {/* 输入引线 */}
      {inputY.map((y, i) => {
        const name = inputNames[i];
        const hot = highInputs.includes(name);
        return (
          <g key={name}>
            <line
              x1={PORT_IN}
              y1={y}
              x2={LEFT}
              y2={y}
              stroke={wire(hot)}
              strokeWidth={hot ? 2.4 : 1.8}
              strokeLinecap="round"
            />
            <circle cx={PORT_IN} cy={y} r={2.6} fill={wire(hot)} />
            <text x={LEFT - 8} y={y - 8} className="gate-symbol__label" textAnchor="middle">
              {name}
            </text>
          </g>
        );
      })}

      {shape}

      {g.bubble && (
        <circle cx={bubbleCx} cy={MID} r={8} fill={fill} stroke={stroke} strokeWidth={1.8} />
      )}

      {/* 输出引线 */}
      <line
        x1={outStart}
        y1={MID}
        x2={PORT_OUT}
        y2={MID}
        stroke={wire(active)}
        strokeWidth={active ? 2.4 : 1.8}
        strokeLinecap="round"
      />
      <circle cx={PORT_OUT} cy={MID} r={2.6} fill={wire(active)} />
      <text x={PORT_OUT + 8} y={MID - 7} className="gate-symbol__label" textAnchor="middle">
        F
      </text>
    </svg>
  );
}
