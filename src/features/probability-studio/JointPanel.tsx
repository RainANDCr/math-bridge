import { useEffect, useMemo, useState } from "react";
import { Dices, Link2, RotateCcw } from "lucide-react";
import { Badge, Button, Callout, Panel, Stat } from "../../components/common";
import type { BooleanFunction } from "../../core/boolean/model";
import {
  analyzeJoint,
  independentWeights,
  normalizeJoint,
  runJointSimulation,
} from "../../core/probability/joint";

/**
 * 输入相关性建模
 *
 * 默认概率模型假设输入独立。这一块把假设本身变成可调的东西：
 * 直接给 2^n 个输入组合的权重，看输出概率怎么变。
 *
 * 关键对比是「边缘概率相同、P(F=1) 不同」：
 * 说明相关性无法由各变量的边缘概率推出，独立不是逻辑必然。
 */
export function JointPanel({
  fn,
  probabilities,
}: {
  fn: BooleanFunction;
  /** 独立模型下的 P(X_i=1)，用来一键填出「独立联合分布」做对照 */
  probabilities: number[];
}) {
  const n = fn.variables.length;
  const total = 1 << n;
  const [weights, setWeights] = useState<number[]>(() => independentWeights(n, probabilities));
  const [seed] = useState(20261126);
  const [simulated, setSimulated] = useState<{ frequency: number; trials: number } | null>(null);

  // 变量个数变了才重建（用户改过的权重不要被独立滑杆悄悄覆盖）
  useEffect(() => {
    setWeights(independentWeights(n, probabilities));
    setSimulated(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  const analysis = useMemo(() => analyzeJoint(fn, weights), [fn, weights]);
  const normalized = useMemo(() => normalizeJoint(weights), [weights]);
  const dependentPairs = analysis.pairs.filter((pair) => pair.dependent);

  const update = (index: number, value: number) => {
    setWeights((current) => current.map((weight, i) => (i === index ? Math.max(0, value) : weight)));
    setSimulated(null);
  };

  const runSimulation = () => {
    const result = runJointSimulation(fn, weights, 20000, seed);
    setSimulated({ frequency: result.frequency, trials: result.trials });
  };

  return (
    <Panel
      title="输入相关性（联合分布）"
      sub="把「输入独立」这个假设本身变成可调参数"
      actions={
        <Badge tone={dependentPairs.length > 0 ? "warn" : "mute"}>
          {dependentPairs.length > 0 ? `${dependentPairs.length} 对输入相关` : "当前即独立模型"}
        </Badge>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <div className="joint-toolbar">
          <span className="tiny dim">
            权重不必和为 1，内部会归一化。共 {total} 种组合。
          </span>
          <div className="row" style={{ gap: 6 }}>
            <Button
              size="sm"
              variant="ghost"
              icon={<Link2 size={12} />}
              onClick={() => {
                setWeights(independentWeights(n, probabilities));
                setSimulated(null);
              }}
            >
              按当前边缘概率填满（独立）
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCcw size={12} />}
              onClick={() => {
                setWeights(new Array(total).fill(1));
                setSimulated(null);
              }}
            >
              均匀
            </Button>
          </div>
        </div>

        <div className="joint-table-wrap">
          <table className="joint-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{fn.variables.join(" ")}</th>
                <th>F</th>
                <th>权重</th>
                <th>概率</th>
              </tr>
            </thead>
            <tbody>
              {analysis.rows.map((row) => (
                <tr key={row.index} className={row.weight > 0 ? "" : "is-zero"}>
                  <td className="mono-td">{row.index}</td>
                  <td className="mono-td">
                    {fn.variables
                      .map((_, j) => ((row.index >> (n - 1 - j)) & 1))
                      .join(" ")}
                  </td>
                  <td className={`mono-td${row.value === 1 ? " is-one" : ""}`}>
                    {row.value}
                  </td>
                  <td>
                    <input
                      className="input joint-input"
                      type="number"
                      min={0}
                      step={0.05}
                      value={Number.isFinite(weights[row.index]) ? weights[row.index] : 0}
                      aria-label={`输入组合 ${row.index} 的权重`}
                      onChange={(event) => update(row.index, Number(event.target.value))}
                    />
                  </td>
                  <td className="mono-td">{(normalized[row.index] * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="stat-grid">
          <Stat label="P(F=1) 联合模型" value={analysis.p1.toFixed(4)} />
          <Stat label="独立模型（同边缘概率）" value={analysis.independentP1.toFixed(4)} />
          <Stat
            label="差值"
            value={`${analysis.delta >= 0 ? "+" : ""}${analysis.delta.toFixed(4)}`}
          />
          <Stat
            label="抽样频率（20000 次）"
            value={simulated ? simulated.frequency.toFixed(4) : "未运行"}
          />
        </div>

        <div className="row wrap" style={{ gap: 8 }}>
          <Button size="sm" icon={<Dices size={13} />} onClick={runSimulation}>
            按联合分布抽 20000 次
          </Button>
          {simulated && (
            <span className="tiny dim" style={{ alignSelf: "center" }}>
              理论 {analysis.p1.toFixed(4)} · 模拟 {simulated.frequency.toFixed(4)} ·
              误差 {Math.abs(simulated.frequency - analysis.p1).toFixed(4)}
            </span>
          )}
        </div>

        {dependentPairs.length > 0 ? (
          <div className="joint-pairs">
            <div className="joint-pairs__head">哪几对输入相关</div>
            {dependentPairs.map((pair) => (
              <div className="joint-pair" key={`${pair.i}-${pair.j}`}>
                <code>
                  {fn.variables[pair.i]} · {fn.variables[pair.j]}
                </code>
                <span>P(同为 1) = {pair.pBoth.toFixed(3)}</span>
                <span className="dim">独立应为 {pair.pProduct.toFixed(3)}</span>
                <span className={pair.pBoth > pair.pProduct ? "is-pos" : "is-neg"}>
                  差 {pair.delta.toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Callout tone="plain">
            当前权重恰好等于各边缘概率之积，所以联合模型与独立模型完全一致。
            把某几行的权重挪一挪（例如只留下「同真同假」的组合），差值就会出现 ——
            这正是「边缘概率推不出相关性」的直接证据。
          </Callout>
        )}

        <div className="tiny dim" style={{ lineHeight: 1.7 }}>
          联合分布只改「输入组合出现的概率」，不改真值表本身。
          抽样是先按权重抽一行、再查表，不是照着理论值造数据；
          同一个种子可复现。无关项（F=X）会让 P(F=1) 成为一个区间，这里只报下界。
        </div>
      </div>
    </Panel>
  );
}
