import type { CircuitLayout, PlacedNode } from "../../core/circuit/layout";
import { inputPinOffsets } from "../../core/circuit/layout";
import type { Circuit } from "../../core/circuit/model";
import type { Bit } from "../../core/circuit/evaluator";

/**
 * 逻辑电路图
 *
 * 用手绘 SVG 画标准门符号（ANSI 形状），而不是给每个门套一个圆角矩形。
 * 这样它与数电教材上的图形一致，学生不需要二次翻译。
 */

function andPath(x0: number, y0: number, w: number, h: number): string {
  const r = h / 2;
  return `M ${x0} ${y0} L ${x0 + w - r} ${y0} A ${r} ${r} 0 0 1 ${x0 + w - r} ${y0 + h} L ${x0} ${
    y0 + h
  } Z`;
}

function orPath(x0: number, y0: number, w: number, h: number): string {
  return [
    `M ${x0} ${y0}`,
    `Q ${x0 + w * 0.42} ${y0} ${x0 + w} ${y0 + h / 2}`,
    `Q ${x0 + w * 0.42} ${y0 + h} ${x0} ${y0 + h}`,
    `Q ${x0 + w * 0.16} ${y0 + h / 2} ${x0} ${y0}`,
    "Z",
  ].join(" ");
}

function GateGlyph({ p, high }: { p: PlacedNode; high: boolean }) {
  const { type, inputs } = p.node;
  const x0 = p.x - p.w / 2;
  const y0 = p.y - p.h / 2;
  const cls = `gate-body ${high ? "is-high" : ""}`;

  if (type === "NOT") {
    const tipX = x0 + p.w - 14;
    return (
      <>
        <path className={cls} d={`M ${x0} ${y0} L ${tipX} ${p.y} L ${x0} ${y0 + p.h} Z`} />
        <circle
          className={cls}
          cx={tipX + 5}
          cy={p.y}
          r={4.6}
          fill={high ? "var(--accent-soft)" : "var(--panel-2)"}
        />
      </>
    );
  }

  if (type === "AND") {
    return <path className={cls} d={andPath(x0, y0, p.w, p.h)} />;
  }

  if (type === "OR") {
    return <path className={cls} d={orPath(x0, y0, p.w, p.h)} />;
  }

  if (type === "XOR") {
    return (
      <>
        <path className={cls} d={orPath(x0 + 4, y0, p.w - 4, p.h)} />
        <path
          d={`M ${x0 - 3} ${y0} Q ${x0 + p.w * 0.12} ${p.y} ${x0 - 3} ${y0 + p.h}`}
          fill="none"
          stroke={high ? "var(--accent)" : "var(--line-strong)"}
          strokeWidth={1.4}
        />
      </>
    );
  }

  // 兜底：不应当出现
  void inputs;
  return <rect className={cls} x={x0} y={y0} width={p.w} height={p.h} rx={4} />;
}

export function CircuitDiagram({
  circuit,
  layout,
  values,
  onToggleInput,
  showLabels = true,
  fit = false,
}: {
  circuit: Circuit;
  layout: CircuitLayout;
  values?: Map<string, Bit>;
  onToggleInput?: (variable: string) => void;
  showLabels?: boolean;
  /** 缩放到容器宽度（用于卡片内的概览图） */
  fit?: boolean;
}) {
  const root = layout.byId.get(circuit.outputId);
  const rootValue = values?.get(circuit.outputId);

  return (
    <div className="circuit-scroll">
      <svg
        className="circuit-svg"
        width={fit ? undefined : layout.width + 34}
        height={fit ? undefined : layout.height}
        style={fit ? { width: "100%", height: "auto", display: "block" } : undefined}
        viewBox={`0 0 ${layout.width + 34} ${layout.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`逻辑电路图：${circuit.nodes.length} 个门与输入端`}
      >
        {/* 连线 */}
        {layout.wires.map((wire) => (
          <g key={`${wire.from}-${wire.to}`}>
            <path className={`wire ${values?.get(wire.from) === 1 ? "is-high" : ""}`} d={wire.d} />
          </g>
        ))}

        {/* 节点 */}
        {layout.placed.map((p) => {
          const high = values?.get(p.node.id) === 1;
          if (p.node.type === "INPUT") {
            const x0 = p.x - p.w / 2;
            const y0 = p.y - p.h / 2;
            return (
              <g
                key={p.node.id}
                style={{ cursor: onToggleInput ? "pointer" : "default" }}
                onClick={() => onToggleInput?.(p.node.label)}
                role={onToggleInput ? "button" : undefined}
                tabIndex={onToggleInput ? 0 : -1}
                aria-label={`输入 ${p.node.label}，当前 ${high ? 1 : 0}`}
                onKeyDown={(event) => {
                  if (onToggleInput && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onToggleInput(p.node.label);
                  }
                }}
              >
                <rect
                  x={x0}
                  y={y0}
                  width={p.w}
                  height={p.h}
                  rx={5}
                  fill={high ? "var(--accent-soft)" : "var(--panel-2)"}
                  stroke={high ? "var(--accent)" : "var(--line-strong)"}
                  strokeWidth={1.3}
                />
                <circle
                  cx={x0 + 11}
                  cy={p.y}
                  r={3.2}
                  fill={high ? "var(--accent)" : "var(--panel-3)"}
                  stroke={high ? "var(--accent)" : "var(--line-strong)"}
                  strokeWidth={1}
                />
                <text className="input-node-label" x={x0 + 30} y={p.y + 4} textAnchor="middle">
                  {p.node.label}
                </text>
                <circle
                  className={`port ${high ? "is-high" : ""}`}
                  cx={p.x + p.w / 2}
                  cy={p.y}
                  r={2.8}
                />
              </g>
            );
          }

          if (p.node.type === "CONST") {
            const x0 = p.x - p.w / 2;
            const y0 = p.y - p.h / 2;
            return (
              <g key={p.node.id}>
                <rect
                  x={x0}
                  y={y0}
                  width={p.w}
                  height={p.h}
                  rx={5}
                  fill="var(--panel-2)"
                  stroke={high ? "var(--accent)" : "var(--line-strong)"}
                  strokeWidth={1.2}
                />
                <text className="input-node-label" x={p.x} y={p.y + 4} textAnchor="middle">
                  {p.node.label}
                </text>
                <circle
                  className={`port ${high ? "is-high" : ""}`}
                  cx={p.x + p.w / 2}
                  cy={p.y}
                  r={2.8}
                />
              </g>
            );
          }

          const pins = inputPinOffsets(p.node, p.h);
          return (
            <g key={p.node.id}>
              <GateGlyph p={p} high={high} />
              {pins.map((offset, i) => (
                <circle
                  key={`pin-${i}`}
                  className={`port ${values?.get(p.node.inputs[i]) === 1 ? "is-high" : ""}`}
                  cx={p.x - p.w / 2 + (p.node.type === "NOT" ? 0 : 1)}
                  cy={p.y + offset}
                  r={2.4}
                />
              ))}
              <circle className={`port ${high ? "is-high" : ""}`} cx={p.x + p.w / 2} cy={p.y} r={2.8} />
              {showLabels && (
                <text className={`gate-label ${high ? "is-high" : ""}`} x={p.x} y={p.y + p.h / 2 + 11} textAnchor="middle">
                  {p.node.type}
                </text>
              )}
            </g>
          );
        })}

        {/* 输出标记 */}
        {root && (
          <g>
            <line
              x1={root.x + root.w / 2}
              y1={root.y}
              x2={root.x + root.w / 2 + 20}
              y2={root.y}
              className={`wire ${rootValue === 1 ? "is-high" : ""}`}
            />
            <text
              x={root.x + root.w / 2 + 26}
              y={root.y + 4}
              className="input-node-label"
              fill={rootValue === 1 ? "var(--accent)" : "var(--text-dim)"}
            >
              F
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
