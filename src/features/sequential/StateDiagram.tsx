import {
  bitsOfCodes,
  codeOf,
  outputAt,
  stateCode,
  stateCodesOf,
  type StateMachine,
} from "../../core/sequential/machine";

/**
 * 状态图
 *
 * 节点按状态编码摆在椭圆上；同一对状态之间的边分别向两侧弯，避免重叠成一条线；
 * 自环画在节点外侧的小圆上。
 *
 * Mealy 型的输出与输入有关，所以边标签要带上 Z —— 同一个转移在不同输入下
 * 可以有不同的输出，必须按「输入 → 输出」拆成不同的边。
 */

const NODE_R = 30;

interface Point {
  x: number;
  y: number;
}

interface Layout {
  points: Point[];
  viewBox: string;
  /** 1–3 个状态用紧凑画布：窄屏上整张图能缩进一屏，不必横向滚动 */
  compact: boolean;
}

function layoutOf(stateCount: number): Layout {
  if (stateCount === 1) {
    return { points: [{ x: 240, y: 130 }], viewBox: "0 0 480 260", compact: true };
  }
  if (stateCount === 2) {
    // 两状态没有环形的必要：并排即可，画布高度也随之压矮
    return {
      points: [
        { x: 150, y: 110 },
        { x: 330, y: 110 },
      ],
      viewBox: "0 0 480 220",
      compact: true,
    };
  }
  if (stateCount === 3) {
    // 三角形：上一下二，比横向一字排开更省宽度
    return {
      points: [
        { x: 240, y: 60 },
        { x: 390, y: 230 },
        { x: 90, y: 230 },
      ],
      viewBox: "0 0 480 300",
      compact: true,
    };
  }
  // 4 个状态铺成横向椭圆：面板宽而矮，正圆会让图缩得很小
  const cx = 420;
  const cy = 150;
  const rx = 280;
  const ry = 96;
  return {
    viewBox: "-10 -32 860 364",
    compact: false,
    points: Array.from({ length: stateCount }, (_, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / stateCount;
      return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
    }),
  };
}

interface EdgeGroup {
  from: number;
  to: number;
  inputs: number[];
  /** Moore 型恒为该状态的输出；Mealy 型按 (输入 → 输出) 拆分 */
  output: 0 | 1;
}

function groupEdges(machine: StateMachine): EdgeGroup[] {
  const mealy = machine.machineType === "mealy";
  const map = new Map<string, EdgeGroup>();
  for (let from = 0; from < machine.stateCount; from += 1) {
    for (let input = 0; input <= 1; input += 1) {
      const raw = machine.transitions[from]?.[input];
      const to = Number.isInteger(raw) && raw >= 0 && raw < machine.stateCount ? raw : 0;
      const output = outputAt(machine, from, input);
      const key = mealy ? `${from}->${to}#${output}` : `${from}->${to}`;
      const hit = map.get(key);
      if (hit) hit.inputs.push(input);
      else map.set(key, { from, to, inputs: [input], output });
    }
  }
  return [...map.values()];
}

function arrowHead(at: Point, towards: Point): string {
  const angle = Math.atan2(at.y - towards.y, at.x - towards.x);
  const size = 7.5;
  const spread = 0.42;
  const p1 = {
    x: at.x - size * Math.cos(angle - spread),
    y: at.y - size * Math.sin(angle - spread),
  };
  const p2 = {
    x: at.x - size * Math.cos(angle + spread),
    y: at.y - size * Math.sin(angle + spread),
  };
  return `M ${at.x} ${at.y} L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} L ${p2.x.toFixed(
    2
  )} ${p2.y.toFixed(2)} Z`;
}

/** 按字符宽度估算标签底板，避免长标签溢出 */
function textWidth(text: string): number {
  return [...text].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 255 ? 11 : 6.8), 0);
}

export function StateDiagram({
  machine,
  activeState,
  onSelectState,
}: {
  machine: StateMachine;
  activeState: number;
  onSelectState?: (state: number) => void;
}) {
  const layout = layoutOf(machine.stateCount);
  const positions = layout.points;
  const edges = groupEdges(machine);
  const bits = bitsOfCodes(stateCodesOf(machine));
  const mealy = machine.machineType === "mealy";
  const hasReverse = (a: number, b: number) =>
    edges.some((edge) => edge.from === b && edge.to === a);
  const center = {
    x: positions.reduce((acc, point) => acc + point.x, 0) / positions.length,
    y: positions.reduce((acc, point) => acc + point.y, 0) / positions.length,
  };

  return (
    <div className="state-diagram-wrap">
    <div className={`state-diagram${layout.compact ? " is-compact" : ""}`}>
      <svg viewBox={layout.viewBox} role="img" aria-label="状态转移图">
        <defs>
          <marker id="state-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-dim)" />
          </marker>
        </defs>

        {edges.map((edge) => {
          const from = positions[edge.from];
          const to = positions[edge.to];
          const inputs = `${machine.inputName}=${edge.inputs.join("/")}`;
          const label = mealy ? `${inputs} / Z=${edge.output}` : inputs;
          const labelWidth = textWidth(label);

          if (edge.from === edge.to) {
            // 自环画成「贴在外侧的小圆」：贝塞尔控制点很难做得稳定，
            // 而且自环压在出边上时几乎无法辨认
            let dir = { x: from.x - center.x, y: from.y - center.y };
            const dirLen = Math.hypot(dir.x, dir.y) || 1;
            dir = { x: dir.x / dirLen, y: dir.y / dirLen };
            if (machine.stateCount <= 2) dir = { x: 0, y: -1 };

            const loopR = 16;
            const loopCenter = {
              x: from.x + dir.x * (NODE_R + loopR),
              y: from.y + dir.y * (NODE_R + loopR),
            };
            // 与节点圆周的切点：箭头从这里指回状态
            const touch = {
              x: loopCenter.x - dir.x * loopR,
              y: loopCenter.y - dir.y * loopR,
            };

            return (
              <g key={`${edge.from}-${edge.to}-${edge.output}`} className="state-edge">
                <circle
                  cx={loopCenter.x}
                  cy={loopCenter.y}
                  r={loopR}
                  fill="none"
                  stroke="var(--line-strong)"
                  strokeWidth={1.4}
                />
                <path
                  d={arrowHead(touch, {
                    x: touch.x + dir.x,
                    y: touch.y + dir.y,
                  })}
                  fill="var(--text-dim)"
                />
                <text
                  x={loopCenter.x + dir.x * (loopR + 12)}
                  y={loopCenter.y + dir.y * (loopR + 12) + 4}
                  textAnchor="middle"
                  className="state-edge__label"
                >
                  {label}
                </text>
              </g>
            );
          }

          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const start = { x: from.x + ux * NODE_R, y: from.y + uy * NODE_R };
          const end = { x: to.x - ux * NODE_R, y: to.y - uy * NODE_R };

          const offset = hasReverse(edge.from, edge.to) ? 26 : 0;
          const nx = -uy;
          const ny = ux;
          const control = {
            x: (start.x + end.x) / 2 + nx * offset,
            y: (start.y + end.y) / 2 + ny * offset,
          };
          const mid = {
            x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
            y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
          };
          const d = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;

          return (
            <g key={`${edge.from}-${edge.to}-${edge.output}`} className="state-edge">
              <path
                d={d}
                fill="none"
                stroke="var(--line-strong)"
                strokeWidth={1.4}
                markerEnd="url(#state-arrow)"
              />
              <rect
                x={mid.x - labelWidth / 2 - 5}
                y={mid.y - 10}
                width={labelWidth + 10}
                height={18}
                rx={4}
                fill="var(--panel-2)"
                stroke="var(--line-soft)"
              />
              <text x={mid.x} y={mid.y + 3} textAnchor="middle" className="state-edge__label">
                {label}
              </text>
            </g>
          );
        })}

        {positions.map((position, index) => {
          const active = index === activeState;
          const code = codeOf(machine, index);
          return (
            <g
              key={`state-${index}`}
              className={`state-node${active ? " is-active" : ""}${onSelectState ? " is-clickable" : ""}`}
              onClick={() => onSelectState?.(index)}
              role={onSelectState ? "button" : undefined}
              tabIndex={onSelectState ? 0 : -1}
              aria-label={`状态 S${index}${
                bits > 0 ? `，编码 ${stateCode(code, bits)}` : ""
              }${!mealy && outputAt(machine, index, 0) === 1 ? "，输出 1" : ""}`}
              onKeyDown={(event) => {
                if (onSelectState && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelectState(index);
                }
              }}
            >
              <circle
                cx={position.x}
                cy={position.y}
                r={NODE_R}
                fill={active ? "var(--accent-soft)" : "var(--panel-2)"}
                stroke={active ? "var(--accent)" : "var(--line-strong)"}
                strokeWidth={active ? 2 : 1.4}
              />
              <text x={position.x} y={position.y - 4} textAnchor="middle" className="state-node__name">
                S{index}
              </text>
              <text x={position.x} y={position.y + 9} textAnchor="middle" className="state-node__code">
                {bits === 0 ? "无状态位" : stateCode(code, bits)}
              </text>
              {!mealy && outputAt(machine, index, 0) === 1 && (
                <text x={position.x} y={position.y + 22} textAnchor="middle" className="state-node__out">
                  Z=1
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
    {!layout.compact && (
      <div className="state-diagram__hint">左右滑动可查看全部 {machine.stateCount} 个状态</div>
    )}
    </div>
  );
}
