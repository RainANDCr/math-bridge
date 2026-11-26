import { useEffect, useRef } from "react";
import type { BooleanFunction, CellValue } from "../../core/boolean/model";

/**
 * 真值表视图
 * 三种状态（1 / 0 / X）在视觉上必须可区分，且不能只靠颜色区分：
 * 1 用绿色 + 加粗，0 用弱化灰，X 用琥珀色并显示字母 X 本身。
 */

export function truthTableCsv(fn: BooleanFunction): string {
  const header = ["m", ...fn.variables, "F"].join(",");
  const rows = fn.values.map((value, index) => {
    const bits = fn.variables.map((_, i) => (index >> (fn.variables.length - 1 - i)) & 1);
    return [index, ...bits, value].join(",");
  });
  return [header, ...rows].join("\n");
}

export function cycleValue(value: CellValue): CellValue {
  if (value === 0) return 1;
  if (value === 1) return "X";
  return 0;
}

export function TruthTable({
  fn,
  selectedRow,
  onSelectRow,
  onHoverRow,
  editable = false,
  onCycle,
  maxHeight = 460,
}: {
  fn: BooleanFunction;
  selectedRow: number | null;
  onSelectRow?: (index: number) => void;
  /** 悬停行变化时回调；与卡诺图等视图共享同一个最小项焦点 */
  onHoverRow?: (index: number | null) => void;
  editable?: boolean;
  onCycle?: (index: number) => void;
  maxHeight?: number;
}) {
  const width = fn.variables.length;
  const wrapRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLTableRowElement>(null);

  // 选中行可能被滚动条挡在外面（尤其在知识连接页，卡片里只露出几行）：
  // 只调整内层容器的 scrollTop，不触发整页滚动。
  useEffect(() => {
    const wrap = wrapRef.current;
    const row = selectedRef.current;
    if (!wrap || !row || selectedRow === null) return;
    const wrapRect = wrap.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < wrapRect.top) {
      wrap.scrollTop -= wrapRect.top - rowRect.top + 4;
    } else if (rowRect.bottom > wrapRect.bottom) {
      wrap.scrollTop += rowRect.bottom - wrapRect.bottom + 4;
    }
  }, [selectedRow]);

  return (
    <div
      ref={wrapRef}
      className="table-wrap"
      style={{ maxHeight }}
      onMouseLeave={onHoverRow ? () => onHoverRow(null) : undefined}
    >
      <table className="tt">
        <caption className="sr-only">真值表：{fn.expression}</caption>
        <thead>
          <tr>
            <th scope="col">m</th>
            {fn.variables.map((variable) => (
              <th key={variable} scope="col">
                {variable}
              </th>
            ))}
            <th scope="col">F</th>
          </tr>
        </thead>
        <tbody>
          {fn.values.map((value, index) => {
            const selected = selectedRow === index;
            const cls = [
              selected ? "is-selected" : "",
              value === 1 ? "is-one" : value === 0 ? "is-zero" : "is-dc",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <tr
                key={index}
                ref={selected ? selectedRef : undefined}
                className={cls}
                onClick={() => onSelectRow?.(index)}
                onMouseEnter={onHoverRow ? () => onHoverRow(index) : undefined}
                style={onSelectRow || onHoverRow ? { cursor: "pointer" } : undefined}
              >
                <td className="tt__idx">{index}</td>
                {fn.variables.map((_, i) => {
                  const bit = (index >> (width - 1 - i)) & 1;
                  return <td key={i}>{bit}</td>;
                })}
                <td className="tt__out-cell">
                  {editable && onCycle ? (
                    <button
                      type="button"
                      className="tt__out-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCycle(index);
                      }}
                      aria-label={`第 ${index} 行输出为 ${value}，点击切换`}
                      title="点击切换 0 → 1 → X"
                    >
                      {value}
                    </button>
                  ) : (
                    <span className="tt__out" style={{ fontWeight: 600 }}>
                      {value}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
