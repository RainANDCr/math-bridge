import { ArrowRight, Combine, Undo2 } from "lucide-react";
import { Badge, Button, Callout, Panel } from "../../components/common";
import { machineTypeOf, outputAt, type StateMachine } from "../../core/sequential/machine";
import type { StateReduction } from "../../core/sequential/reduction";

/**
 * 状态化简面板
 *
 * 不只给「合并成 3 个状态」这个结论：把每一轮的划分摆出来，
 * 并指出是哪一位输入把某个块拆开的。学生要能自己重做一遍这个推理。
 */
export function ReductionPanel({
  machine,
  reduction,
  onApply,
  canUndo,
  onUndo,
}: {
  machine: StateMachine;
  reduction: StateReduction;
  onApply: (merged: StateMachine) => void;
  /** 上一次化简的结果是否仍是当前机器（改过任何一格就失效） */
  canUndo: boolean;
  onUndo: () => void;
}) {
  const mealy = machineTypeOf(machine) === "mealy";

  return (
    <Panel
      title="状态化简"
      sub="对任意输入序列输出都相同的两个状态，在电路里就是同一个状态"
      actions={
        <Badge tone={reduction.changed ? "accent" : "ok"}>
          {reduction.changed
            ? `${reduction.originalCount} → ${reduction.mergedCount} 个状态`
            : "已是最简"}
        </Badge>
      }
    >
      <div className="stack" style={{ gap: 10 }}>
        <div className="reduce-rounds">
          {reduction.rounds.map((round) => (
            <div className="reduce-round" key={round.index}>
              <div className="reduce-round__head">
                <span className="reduce-round__index">{String(round.index).padStart(2, "0")}</span>
                <span className="reduce-round__title">{round.title}</span>
                <span className="tiny dim">{round.blocks.length} 组</span>
              </div>
              <div className="reduce-blocks">
                {round.blocks.map((block) => (
                  <span
                    className={`reduce-block${block.length > 1 ? " is-merged" : ""}`}
                    key={block.join("-")}
                  >
                    <code>
                      {block.length === 1
                        ? `S${block[0]}`
                        : `{${block.map((state) => `S${state}`).join("、")}}`}
                    </code>
                    <span className="reduce-block__out">
                      {mealy
                        ? `Z=${outputAt(machine, block[0], 0)}/${outputAt(machine, block[0], 1)}`
                        : `Z=${outputAt(machine, block[0], 0)}`}
                    </span>
                  </span>
                ))}
              </div>
              <div className="reduce-note">{round.note}</div>
            </div>
          ))}
        </div>

        {reduction.changed ? (
          <>
            <div className="reduce-result">
              <div className="reduce-result__line">
                <span className="small">合并结果</span>
                <code>
                  {reduction.blocks
                    .map((block) =>
                      block.length === 1
                        ? `S${block[0]}`
                        : `{${block.map((state) => `S${state}`).join("、")}}`
                    )
                    .join("  ")}
                </code>
                <ArrowRight size={12} style={{ color: "var(--text-mute)" }} />
                <span className="tiny dim">
                  {reduction.originalBits} 位 → {reduction.mergedBits} 位 ·{" "}
                  {reduction.mergedBits === reduction.originalBits
                    ? "位宽不变，省下的是方程与无效状态"
                    : `省 ${reduction.originalBits - reduction.mergedBits} 个触发器`}
                </span>
              </div>
              <div className="reduce-verify">
                {reduction.verified ? "✓" : "✗"} 穷举长度 ≤ {reduction.depth} 的{" "}
                {reduction.sequences} 条输入序列，合并前后每一拍输出都相同
              </div>
            </div>

            <div className="row wrap" style={{ gap: 8 }}>
              <Button
                variant="primary"
                icon={<Combine size={13} />}
                onClick={() => onApply(reduction.merged)}
              >
                应用化简结果
              </Button>
              <span className="tiny dim" style={{ alignSelf: "center" }}>
                状态重新编号为 S0…S{reduction.mergedCount - 1}，转移表与输出会一起替换
              </span>
            </div>
          </>
        ) : (
          <Callout tone="plain">
            {reduction.originalCount === 1
              ? "只有 1 个状态，没有可合并的对象，也不需要状态位。"
              : "没有可合并的状态：任意两个状态都能被某条输入序列区分开。"}
            {reduction.rounds.length > 1
              ? "上面几轮的「分裂」记录的就是区分它们的那一位输入。"
              : ""}
          </Callout>
        )}

        {canUndo && (
          <div className="reduce-undo">
            <Badge tone="ok">已应用化简</Badge>
            <span className="tiny dim">化简前的转移表还能找回；改动任何一格后失效</span>
            <Button size="sm" variant="ghost" icon={<Undo2 size={12} />} onClick={onUndo}>
              撤销化简
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}
