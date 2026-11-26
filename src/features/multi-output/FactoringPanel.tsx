import { ArrowRight, Boxes } from "lucide-react";
import { Badge, Callout, Panel, Stat } from "../../components/common";
import type { FactoringResult } from "../../core/karnaugh/factoring";

/**
 * 子表达式共享的两个面板：
 *   · 定义序列：T1 = A·B 这样的命名节点，直接对应电路里的门
 *   · 成本对比：门数 + 连线数（同一套统计规则套在两种形式上）
 */

export function FactorDefinitionList({
  factored,
  outputNames,
}: {
  factored: FactoringResult;
  outputNames: string[];
}) {
  return (
    <Panel
      title="子表达式（定义序列）"
      sub="每一行就是一个门；被多个输出引用的行是共享节点"
      actions={
        <Badge tone={factored.sharedNodes > 0 ? "ok" : "mute"}>
          {factored.sharedNodes} 个共享子表达式
        </Badge>
      }
    >
      {factored.definitions.length === 0 ? (
        <Callout tone="plain">这些输出之间没有可提取的公共因子，两级形式已经是最省的。</Callout>
      ) : factored.sharedNodes === 0 ? (
        <Callout tone="plain">
          没有共享子表达式：下面只是两级形式的门级展开，与上面的乘积项一一对应。
          试试「公共因子 A·B」示例。
        </Callout>
      ) : null}

      {factored.definitions.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          {factored.definitions.map((definition) => (
            <div
              className={`factor-row${definition.shared ? " is-shared" : ""}`}
              key={definition.name}
            >
              <code className="factor-row__name">{definition.name}</code>
              <span className="factor-row__eq">=</span>
              <code className="factor-row__expr">{definition.expression}</code>
              <span className="factor-row__op">{definition.op === "and" ? "与" : "或"}</span>
              <div className="factor-row__consumers">
                {definition.consumers.map((consumer) => {
                  const isOutput = outputNames.includes(consumer);
                  return (
                    <span
                      key={consumer}
                      className={`factor-consumer${isOutput ? " is-output" : ""}`}
                    >
                      {consumer}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="stack" style={{ gap: 5, marginTop: 10 }}>
        {factored.outputs.map((output) => (
          <div className="factor-output" key={output.name}>
            <span className="factor-output__name">{output.name}</span>
            <ArrowRight size={11} style={{ color: "var(--text-mute)", flexShrink: 0 }} />
            <code className="factor-output__expr">{output.expression}</code>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function FactorCostPanel({ factored }: { factored: FactoringResult }) {
  const max = Math.max(factored.twoLevelCost, factored.factoredCost, 1);
  const saved = factored.twoLevelCost - factored.factoredCost;

  return (
    <Panel
      title="成本对比"
      sub="门数与连线数分开看，再用合计作为面积代理"
      actions={<Badge tone={saved > 0 ? "ok" : "mute"}>{saved > 0 ? `省 ${saved}` : "持平"}</Badge>}
    >
      <div className="stack" style={{ gap: 10 }}>
        <div className="cost-block">
          <div className="cost-block__head">
            <span className="small muted">两级与或式</span>
            <span className="mono">{factored.twoLevelCost}</span>
          </div>
          <div className="cost-block__meta">
            {factored.twoLevel.gates} 门 · {factored.twoLevel.wires} 连线 ·{" "}
            {factored.twoLevel.terms} 个乘积项
          </div>
          <div className="compare-bar">
            <div
              className="compare-bar__fill is-muted"
              style={{ width: `${Math.round((factored.twoLevelCost / max) * 100)}%` }}
            />
          </div>
        </div>

        <div className={`cost-block${saved > 0 ? " is-best" : ""}`}>
          <div className="cost-block__head">
            <span className="small">子表达式共享</span>
            <span className="mono">{factored.factoredCost}</span>
          </div>
          <div className="cost-block__meta">
            {factored.factored.gates} 门 · {factored.factored.wires} 连线
          </div>
          <div className="compare-bar">
            <div
              className="compare-bar__fill"
              style={{ width: `${Math.round((factored.factoredCost / max) * 100)}%` }}
            />
          </div>
        </div>

        <div className="stat-grid">
          <Stat label="门数变化" value={`${factored.twoLevel.gates}→${factored.factored.gates}`} />
          <Stat label="连线变化" value={`${factored.twoLevel.wires}→${factored.factored.wires}`} />
          <Stat label="共享节点" value={factored.sharedNodes} />
        </div>

        <div className="tiny dim" style={{ lineHeight: 1.7 }}>
          {factored.notes.join("；")}。
          <br />
          合计 = 门数 + 连线数。这是一个<strong>面积代理</strong>：门越多、连线越多，芯片上占的面积越大。
          它不含延迟 —— 因式分解会让信号穿过更多层门，路径可能变长，这一点在高速电路里要单独算。
          <br />
          注意口径：上一个视图的「文字数 + 1」只估两级电路、且不区分门与连线；
          这里为了让两种形式可比，统一按「门 + 连线」统计。两个数不能直接相加或换算。
        </div>

        {saved > 0 && (
          <Callout tone="ok">
            共享粒度从「整个乘积项」降到「任意公共因子」后，又能省下 {saved} 个单位的成本。
            这些子表达式原本要在每个输出里各写一遍。
          </Callout>
        )}
      </div>
    </Panel>
  );
}

export function FactorNotePanel({ factored }: { factored: FactoringResult }) {
  return (
    <Panel title="两级 vs 多级" actions={<Boxes size={14} style={{ color: "var(--text-mute)" }} />}>
      <div className="stack" style={{ gap: 8 }}>
        <p className="small muted" style={{ lineHeight: 1.7 }}>
          两级 SOP 里，一个乘积项要么整体共享，要么完全不共享。可
          <code>A·B·C</code> 与 <code>A·B·D</code> 明明都含 <code>A·B</code>，
          只因为整项不同就没法共用。
        </p>
        <p className="small muted" style={{ lineHeight: 1.7 }}>
          因式分解把共享粒度降到文字级：先把 <code>A·B</code> 提出来造成一个门，
          两个输出都接它的输出，再把剩下的 <code>C</code> 与 <code>D</code> 分别与它相接 ——
          这就是多级逻辑。
        </p>
        <p className="small muted" style={{ lineHeight: 1.7 }}>
          代价是<strong>层级变深</strong>：两级电路最多经过 2 个门，多级可能要 3–4 个。
          所以这里同时给出「门数」和「连线数」，而不是宣称一个绝对的「更优」。
        </p>
        <div className="tiny dim">
          当前：{factored.definitions.length} 个中间节点，{factored.sharedNodes} 个被多个输出共用。
        </div>
      </div>
    </Panel>
  );
}
