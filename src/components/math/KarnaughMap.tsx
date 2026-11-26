import { useMemo } from "react";
import type { CellValue } from "../../core/boolean/model";
import { cellAssignment, type KMapLayout } from "../../core/karnaugh/mapping";
import { tracePlaneOutline } from "../../core/karnaugh/outline";

/**
 * 卡诺图渲染
 *
 * 关键点：分组用「并集边界」画，而不是画一个大矩形：
 * 对组内每个格子，只画出「邻居不在组内」的那几条边。
 * 这样跨左右边界、跨上下边界的环绕分组会自然显示成两段，
 * 四角分组会显示成四个角上的小块 —— 与教材画法一致。
 *
 * 5–6 变量：多出来的变量叠成平面（2 页 / 4 页 4×4），
 * 同一位置、相邻平面的格子也是相邻的，轮廓按页分别追踪。
 */

export interface KMapGroupView {
  id: string;
  cells: number[];
  colorIndex: number;
  kind: "auto" | "manual" | "alt";
  label?: string;
}

export const GROUP_COUNT = 8;

export function groupColor(index: number): string {
  return `var(--g${(index % GROUP_COUNT) + 1})`;
}

interface Geometry {
  cellW: number;
  cellH: number;
  headW: number;
  headH: number;
  capH: number;
  gap: number;
  valueFont: number;
  mintermFont: number;
  valueDyFull: number;
  valueDyPlain: number;
  mintermDy: number;
}

const SINGLE: Geometry = {
  cellW: 66,
  cellH: 54,
  headW: 54,
  headH: 34,
  capH: 0,
  gap: 0,
  valueFont: 18,
  mintermFont: 9,
  valueDyFull: 0,
  valueDyPlain: 7,
  mintermDy: 16,
};

const MULTI: Geometry = {
  cellW: 48,
  cellH: 42,
  headW: 44,
  headH: 28,
  capH: 20,
  gap: 16,
  valueFont: 15,
  mintermFont: 8,
  valueDyFull: -1,
  valueDyPlain: 5,
  mintermDy: 13,
};

export function KarnaughMap({
  layout,
  values,
  groups,
  pending = [],
  hovered,
  onHover,
  onCellClick,
  showMinterms = true,
  showGrayCode = true,
  interactive = true,
  highlight = [],
  ariaLabel = "卡诺图",
}: {
  layout: KMapLayout;
  values: CellValue[];
  groups: KMapGroupView[];
  pending?: number[];
  hovered?: number | null;
  onHover?: (minterm: number | null) => void;
  onCellClick?: (minterm: number) => void;
  showMinterms?: boolean;
  showGrayCode?: boolean;
  interactive?: boolean;
  highlight?: number[];
  ariaLabel?: string;
}) {
  const positions = useMemo(() => {
    const map = new Map<number, { plane: number; row: number; col: number }>();
    layout.planes.forEach((plane) => {
      plane.cells.forEach((rowArr, r) =>
        rowArr.forEach((m, c) => map.set(m, { plane: plane.index, row: r, col: c }))
      );
    });
    return map;
  }, [layout]);

  const geo = layout.planeBits > 0 ? MULTI : SINGLE;
  const rowCount = layout.rows.length;
  const colCount = layout.cols.length;
  const planeW = geo.headW + colCount * geo.cellW;
  const planeH = geo.capH + geo.headH + rowCount * geo.cellH;

  const gridCols = layout.planeBits >= 2 ? 2 : Math.max(1, layout.planes.length);
  const gridRows = layout.planeBits >= 2 ? 2 : 1;
  const width = gridCols * planeW + (gridCols - 1) * geo.gap;
  const height = gridRows * planeH + (gridRows - 1) * geo.gap;

  const pendingSet = useMemo(() => new Set(pending), [pending]);
  const highlightSet = useMemo(() => new Set(highlight), [highlight]);

  const cellFill = (value: CellValue): string =>
    value === 1 ? "var(--cell-1)" : value === "X" ? "var(--cell-x)" : "var(--cell-0)";

  const valueColor = (value: CellValue): string =>
    value === 1 ? "var(--ok)" : value === "X" ? "var(--warn)" : "var(--text-mute)";

  return (
    <div className="kmap-scroll">
      <svg
        className="kmap-svg"
        width={width + 8}
        height={height + 8}
        viewBox={`-4 -4 ${width + 8} ${height + 8}`}
        role="group"
        aria-label={ariaLabel}
      >
        {layout.planes.map((plane, planeIndex) => {
          const ox = (planeIndex % gridCols) * (planeW + geo.gap);
          const oy = Math.floor(planeIndex / gridCols) * (planeH + geo.gap);
          const top = oy + geo.capH;

          return (
            <g key={`plane-${plane.index}`}>
              {geo.capH > 0 && (
                <>
                  <text className="kmap-plane" x={ox + 2} y={oy + 14}>
                    {plane.label}
                  </text>
                </>
              )}

              {/* 角落：区分行变量与列变量 */}
              <rect
                x={ox}
                y={top}
                width={geo.headW}
                height={geo.headH}
                fill="var(--panel-2)"
                stroke="var(--line)"
              />
              <line
                x1={ox}
                y1={top + geo.headH}
                x2={ox + geo.headW}
                y2={top}
                stroke="var(--line)"
              />
              <text x={ox + geo.headW - 6} y={top + geo.headH / 2 - 3} textAnchor="end" className="kmap-var">
                {layout.colVariables.join("") || "—"}
              </text>
              <text x={ox + 6} y={top + geo.headH - 6} textAnchor="start" className="kmap-var">
                {layout.rowVariables.join("") || "—"}
              </text>

              {/* 列头 */}
              {layout.cols.map((col, c) => (
                <g key={`ch-${plane.index}-${c}`}>
                  <rect
                    x={ox + geo.headW + c * geo.cellW}
                    y={top}
                    width={geo.cellW}
                    height={geo.headH}
                    fill="var(--panel-2)"
                    stroke="var(--line)"
                  />
                  <text
                    x={ox + geo.headW + c * geo.cellW + geo.cellW / 2}
                    y={top + geo.headH / 2 + 4}
                    textAnchor="middle"
                    className="kmap-header"
                  >
                    {showGrayCode ? col.label : String(col.value)}
                  </text>
                </g>
              ))}

              {/* 行头 */}
              {layout.rows.map((row, r) => (
                <g key={`rh-${plane.index}-${r}`}>
                  <rect
                    x={ox}
                    y={top + geo.headH + r * geo.cellH}
                    width={geo.headW}
                    height={geo.cellH}
                    fill="var(--panel-2)"
                    stroke="var(--line)"
                  />
                  <text
                    x={ox + geo.headW / 2}
                    y={top + geo.headH + r * geo.cellH + geo.cellH / 2 + 4}
                    textAnchor="middle"
                    className="kmap-header"
                  >
                    {showGrayCode ? row.label : String(row.value)}
                  </text>
                </g>
              ))}

              {/* 单元格底色 */}
              {plane.cells.map((rowArr, r) =>
                rowArr.map((m, c) => (
                  <rect
                    key={`cell-${m}`}
                    x={ox + geo.headW + c * geo.cellW}
                    y={top + geo.headH + r * geo.cellH}
                    width={geo.cellW}
                    height={geo.cellH}
                    fill={cellFill(values[m] ?? "X")}
                    stroke="var(--line)"
                    strokeWidth={1}
                  />
                ))
              )}

              {/* 分组：填充与描边使用同一条闭合路径，保证组内没有接缝、拐角不断线 */}
              {groups.map((group, gi) => {
                const local = group.cells.filter((m) => positions.get(m)?.plane === plane.index);
                if (local.length === 0) return null;
                const paths = tracePlaneOutline(group.cells, layout, plane.index, {
                  cellW: geo.cellW,
                  cellH: geo.cellH,
                  originX: ox + geo.headW,
                  originY: top + geo.headH,
                });
                const color = groupColor(group.colorIndex);
                const strokeW = 2 + (gi % 3) * 0.45;
                return paths.map((d, i) => (
                  <g key={`gp-${group.id}-${plane.index}-${i}`} style={{ pointerEvents: "none" }}>
                    <path d={d} fill={color} fillOpacity={0.12} />
                    <path
                      d={d}
                      className="kmap-outline"
                      stroke={color}
                      strokeWidth={strokeW}
                      strokeLinejoin="round"
                    />
                  </g>
                ));
              })}

              {/* 待确认的手动选择 */}
              {pending.map((m) => {
                const pos = positions.get(m);
                if (!pos || pos.plane !== plane.index) return null;
                return (
                  <rect
                    key={`pending-${m}`}
                    className="kmap-pending"
                    x={ox + geo.headW + pos.col * geo.cellW + 4}
                    y={top + geo.headH + pos.row * geo.cellH + 4}
                    width={geo.cellW - 8}
                    height={geo.cellH - 8}
                    rx={4}
                    style={{ pointerEvents: "none" }}
                  />
                );
              })}

              {/* 数值与编号 */}
              {plane.cells.map((rowArr, r) =>
                rowArr.map((m, c) => {
                  const value = values[m] ?? "X";
                  const x = ox + geo.headW + c * geo.cellW;
                  const y = top + geo.headH + r * geo.cellH;
                  const isHovered = hovered === m;
                  return (
                    <g key={`txt-${m}`} style={{ pointerEvents: "none" }}>
                      {isHovered && (
                        <rect
                          x={x + 1}
                          y={y + 1}
                          width={geo.cellW - 2}
                          height={geo.cellH - 2}
                          fill="none"
                          stroke="var(--accent)"
                          strokeWidth={1.6}
                          rx={3}
                        />
                      )}
                      {highlightSet.has(m) && (
                        <rect
                          className="kmap-focus-ring"
                          x={x + 2}
                          y={y + 2}
                          width={geo.cellW - 4}
                          height={geo.cellH - 4}
                          fill="var(--accent)"
                          fillOpacity={0.09}
                          stroke="var(--accent)"
                          strokeWidth={1.9}
                          strokeDasharray="4 3"
                          rx={4}
                        />
                      )}
                      <text
                        className="kmap-value"
                        x={x + geo.cellW / 2}
                        y={
                          y +
                          geo.cellH / 2 +
                          (showMinterms ? geo.valueDyFull : geo.valueDyPlain)
                        }
                        textAnchor="middle"
                        fontSize={geo.valueFont}
                        fill={valueColor(value)}
                      >
                        {value}
                      </text>
                      {showMinterms && (
                        <text
                          className="kmap-minterm"
                          x={x + geo.cellW / 2}
                          y={y + geo.cellH / 2 + geo.mintermDy}
                          textAnchor="middle"
                          fontSize={geo.mintermFont}
                        >
                          m{m}
                        </text>
                      )}
                    </g>
                  );
                })
              )}

              {/* 交互层 */}
              {plane.cells.map((rowArr, r) =>
                rowArr.map((m, c) => {
                  const x = ox + geo.headW + c * geo.cellW;
                  const y = top + geo.headH + r * geo.cellH;
                  const value = values[m] ?? "X";
                  return (
                    <rect
                      key={`hit-${m}`}
                      className={`kmap-cell ${interactive ? "" : "kmap-cell--static"}`}
                      x={x}
                      y={y}
                      width={geo.cellW}
                      height={geo.cellH}
                      fill="transparent"
                      tabIndex={interactive ? 0 : -1}
                      role={interactive ? "button" : undefined}
                      aria-label={`m${m}，${cellAssignment(layout, m)}，输出 ${value}${
                        pendingSet.has(m) ? "，已选入待确认分组" : ""
                      }`}
                      onMouseEnter={() => onHover?.(m)}
                      onMouseLeave={() => onHover?.(null)}
                      onFocus={() => onHover?.(m)}
                      onBlur={() => onHover?.(null)}
                      onClick={() => onCellClick?.(m)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onCellClick?.(m);
                        }
                      }}
                    >
                      <title>{`m${m} · ${cellAssignment(layout, m)} · F=${value}`}</title>
                    </rect>
                  );
                })
              )}
            </g>
          );
        })}
      </svg>
      {layout.planeBits > 0 && (
        <div className="kmap-plane-note">
          同一位置、相邻页的格子也算相邻；页按格雷码排列，首尾同样相邻。
        </div>
      )}
    </div>
  );
}
