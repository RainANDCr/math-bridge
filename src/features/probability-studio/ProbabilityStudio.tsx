import { useEffect, useMemo, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { useApp, probabilityArray } from "../../store/appStore";
import { Badge, Button, Callout, Panel, Segmented, Slider, Stat, Switch } from "../../components/common";
import { CompareBars, ConvergenceChart } from "../../components/charts/Charts";
import { JointPanel } from "./JointPanel";
import {
  theoreticalProbability,
} from "../../core/probability/theoretical";
import {
  MonteCarloRun,
  randomSeed,
  simulationStdError,
  type SimulationResult,
} from "../../core/probability/simulation";

const TRIAL_OPTIONS = [100, 1000, 10000, 100000];

function NumberField({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft((prev) => (Number(prev) === value ? prev : String(value)));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) {
      const clamped = Math.min(max, Math.max(min, parsed));
      onChange(clamped);
      setDraft(String(clamped));
    } else {
      setDraft(String(value));
    }
  };

  return (
    <input
      className="input input--num"
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      aria-label={label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
      style={{ width: 68, height: 24, padding: "0 6px", fontSize: 12 }}
    />
  );
}

export function ProbabilityStudio() {
  const { state, actions } = useApp();
  const fn = state.fn;
  const probs = useMemo(
    () => probabilityArray(fn.variables, state.probabilities),
    [fn.variables, state.probabilities]
  );
  const theory = useMemo(() => theoreticalProbability(fn, probs), [fn, probs]);

  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [token, setToken] = useState(0);
  const rafRef = useRef(0);

  const probsKey = probs.join(",");
  const { trials, seed, useFixedSeed } = state;

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setProgress(0);
    setRunning(false);

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const actualSeed = useFixedSeed ? seed : randomSeed();
      const run = new MonteCarloRun(fn, probs, trials, actualSeed);
      const chunk = Math.max(200, Math.ceil(trials / 40));
      setRunning(true);

      const tick = () => {
        if (cancelled) return;
        run.step(chunk);
        setProgress(run.trials / trials);
        if (!run.finished) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setResult(run.result());
          setRunning(false);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, probsKey, trials, seed, useFixedSeed, token]);

  const simulated = result?.frequency ?? null;
  const absError = simulated === null ? null : Math.abs(simulated - theory.p1);
  const stdErr = simulationStdError(theory.p1, result?.trials ?? trials);
  const withinTolerance = absError !== null && absError < stdErr * 3;

  return (
    <>
      <main className="studio__main">
        <div className="page-head">
          <div className="page-head__text">
            <h2>布尔函数是一组事件</h2>
            <p>
              把每个输入当成一个可能发生的事件，F=1 就是一个复合事件。给定各输入取 1
              的概率，就能算出输出概率；再用真实随机抽样，看频率如何靠近它。
            </p>
          </div>
          <div className="page-head__actions">
            <Badge tone="warn">独立同分布假设</Badge>
            <Badge tone="mute">{fn.variables.length} 个输入</Badge>
          </div>
        </div>

        <div className="split-main">
          <div className="stack" style={{ gap: 14 }}>
            <Panel
              title="输入概率"
              sub="P(X = 1)"
              actions={
                <Button size="sm" variant="ghost" icon={<RotateCcw size={12} />} onClick={actions.resetProbabilities}>
                  全部 0.5
                </Button>
              }
            >
              <div className="stack" style={{ gap: 12 }}>
                {fn.variables.length === 0 && (
                  <Callout tone="plain">当前是常量函数，没有输入变量。</Callout>
                )}
                {fn.variables.map((variable) => {
                  const p = state.probabilities[variable] ?? 0.5;
                  return (
                    <div className="prob-var" key={variable}>
                      <div className="prob-var__head">
                        <span className="prob-var__name">P({variable} = 1)</span>
                        <div className="row" style={{ gap: 6 }}>
                          <NumberField
                            value={p}
                            onChange={(value) => actions.setProbability(variable, value)}
                            label={`设置 P(${variable}=1)`}
                          />
                        </div>
                      </div>
                      <Slider
                        value={p}
                        onChange={(value) => actions.setProbability(variable, value)}
                        label={`P(${variable}=1) 滑块`}
                      />
                    </div>
                  );
                })}
                {fn.variables.length > 0 && (
                  <Callout tone="info">
                    <strong>这里默认各输入变量相互独立。</strong> 因此每个输入组合的概率等于各变量概率之积，
                    例如 P(A=1, B=0) = P(A)·(1−P(B))。若变量之间存在关联，这个模型就不再适用。
                  </Callout>
                )}
              </div>
            </Panel>

            <Panel
              title="理论概率"
              actions={<Badge tone="accent">解析计算</Badge>}
            >
              <div className="row" style={{ alignItems: "flex-end", gap: 10 }}>
                <span
                  className="mono"
                  style={{ fontSize: 34, fontWeight: 600, lineHeight: 1, color: "var(--accent-strong)" }}
                >
                  {theory.p1.toFixed(4)}
                </span>
                <span className="small dim" style={{ marginBottom: 3 }}>
                  P(F = 1)
                </span>
              </div>

              <div style={{ marginTop: 12 }}>
                <CompareBars theory={theory.p1} simulated={simulated} />
              </div>

              <div className="stat-grid" style={{ marginTop: 12 }}>
                <Stat label="P(F=0)" value={theory.p0.toFixed(4)} />
                <Stat label="P(F=1)" value={theory.p1.toFixed(4)} />
                <Stat label="有效行数" value={theory.rows.filter((r) => r.value !== "X").length} />
              </div>

              {theory.hasDontCares && (
                <Callout tone="warn">
                  函数含无关项：这些行既可能是 0 也可能是 1，所以输出概率不是一个定值，而是区间{" "}
                  <strong>
                    [{theory.lowerBound.toFixed(4)}, {theory.upperBound.toFixed(4)}]
                  </strong>
                  。模拟时按 X=0 处理。
                </Callout>
              )}

              <details style={{ marginTop: 10 }}>
                <summary className="small muted" style={{ cursor: "pointer" }}>
                  看每一项的贡献（P(F=1) 的加和过程）
                </summary>
                <div className="table-wrap" style={{ maxHeight: 220, marginTop: 8 }}>
                  <table className="tt">
                    <thead>
                      <tr>
                        <th>m</th>
                        {fn.variables.map((v) => (
                          <th key={v}>{v}</th>
                        ))}
                        <th>F</th>
                        <th>P(该组合)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {theory.rows.map((row) => (
                        <tr key={row.index} className={row.value === 1 ? "is-one" : row.value === "X" ? "is-dc" : "is-zero"}>
                          <td className="tt__idx">{row.index}</td>
                          {fn.variables.map((_, i) => (
                            <td key={i}>{(row.index >> (fn.variables.length - 1 - i)) & 1}</td>
                          ))}
                          <td style={{ fontWeight: 600 }}>{row.value}</td>
                          <td>{row.weight.toFixed(5)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </Panel>
          </div>

          <div className="stack" style={{ gap: 14 }}>
            <Panel
              title="蒙特卡洛模拟"
              actions={
                <Badge tone={running ? "accent" : result ? "ok" : "mute"}>
                  {running ? "运行中" : result ? `${result.trials.toLocaleString()} 次` : "待运行"}
                </Badge>
              }
            >
              <div className="stack" style={{ gap: 10 }}>
                <div>
                  <div className="field__label" style={{ marginBottom: 4 }}>
                    试验次数
                  </div>
                  <Segmented
                    block
                    value={String(trials)}
                    onChange={(value) => actions.setTrials(Number(value))}
                    label="试验次数"
                    options={TRIAL_OPTIONS.map((t) => ({
                      value: String(t),
                      label: t >= 1000 ? `${t / 1000}k` : String(t),
                    }))}
                  />
                </div>

                <div className="switch-row">
                  <span>固定随机种子（可复现）</span>
                  <Switch
                    checked={useFixedSeed}
                    onChange={actions.setUseFixedSeed}
                    label="固定随机种子"
                  />
                </div>

                {useFixedSeed && (
                  <div className="row" style={{ gap: 8 }}>
                    <span className="small muted">种子</span>
                    <NumberField
                      value={seed}
                      min={1}
                      max={4294967295}
                      step={1}
                      onChange={actions.setSeed}
                      label="随机种子"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => actions.setSeed(randomSeed())}
                      title="换一个随机种子"
                    >
                      随机换一个
                    </Button>
                  </div>
                )}

                {running && (
                  <div>
                    <div
                      style={{
                        height: 4,
                        borderRadius: 999,
                        background: "var(--panel-3)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.round(progress * 100)}%`,
                          background: "var(--accent)",
                          transition: "width 120ms linear",
                        }}
                      />
                    </div>
                    <div className="tiny dim" style={{ marginTop: 4 }}>
                      正在抽样 {Math.round(progress * trials).toLocaleString()} / {trials.toLocaleString()}
                    </div>
                  </div>
                )}

                <div className="row" style={{ gap: 6 }}>
                  <Button
                    variant="primary"
                    icon={<Play size={13} />}
                    onClick={() => setToken((t) => t + 1)}
                    disabled={running}
                    block
                  >
                    重新运行模拟
                  </Button>
                </div>

                <div className="stat-grid">
                  <Stat label="输出为 1" value={result ? result.ones.toLocaleString() : "—"} />
                  <Stat label="输出为 0" value={result ? result.zeros.toLocaleString() : "—"} />
                  <Stat label="模拟频率" value={result ? result.frequency.toFixed(4) : "—"} />
                  <Stat label="理论概率" value={theory.p1.toFixed(4)} />
                  <Stat
                    label="绝对误差"
                    value={absError === null ? "—" : absError.toFixed(4)}
                    unit={withinTolerance ? "✓" : undefined}
                  />
                  <Stat label="理论标准差" value={`±${(stdErr || 0).toFixed(4)}`} />
                </div>

                {result && (
                  <Callout tone={withinTolerance ? "ok" : "warn"}>
                    {withinTolerance
                      ? `误差 ${(absError ?? 0).toFixed(4)} 在 3 倍标准差（${(stdErr * 3).toFixed(
                          4
                        )}）之内，符合随机抽样的正常波动。`
                      : `误差 ${(absError ?? 0).toFixed(4)} 偏大，可能只是这一轮运气不好，多跑几次或增加试验次数再判断。`}
                  </Callout>
                )}
              </div>
            </Panel>

            <Panel
              title="收敛曲线"
              sub="横轴对数刻度 · 纵轴自适应"
              actions={
                <div className="chart-legend">
                  <span className="chart-legend__item">
                    <span className="chart-legend__line" />
                    模拟
                  </span>
                  <span className="chart-legend__item">
                    <span className="chart-legend__line chart-legend__line--dashed" />
                    理论
                  </span>
                </div>
              }
            >
              <ConvergenceChart
                checkpoints={result?.checkpoints ?? []}
                theory={theory.p1}
                total={trials}
              />
              <div className="tiny dim" style={{ marginTop: 4 }}>
                浅色带为 ±2σ 的理论波动范围（σ = √(p(1−p)/n)）。曲线应当落在带内，并随 n 增大而收窄。
              </div>
            </Panel>
          </div>
        </div>

        <JointPanel fn={fn} probabilities={probs} />
      </main>

      <aside className="inspector" aria-label="概率分析说明">
        <Panel title="手算核对" actions={<Badge tone="mute">独立假设</Badge>}>
          <div className="formula" style={{ whiteSpace: "pre-wrap", marginBottom: 8 }}>
            P(F=1) = Σ P(x), x 使 F(x)=1
          </div>
          <div className="small muted" style={{ lineHeight: 1.7 }}>
            当前 {fn.variables.length} 个变量共有 {theory.rows.length} 种输入组合。把 F=1 的那些行的概率相加，得到{" "}
            <strong style={{ color: "var(--accent-strong)" }}>{theory.p1.toFixed(6)}</strong>。
          </div>
          <div className="stack" style={{ gap: 5, marginTop: 10 }}>
            {theory.rows
              .filter((r) => r.value === 1)
              .slice(0, 6)
              .map((r) => (
                <div className="row-between tiny" key={r.index} style={{ fontFamily: "var(--font-mono)" }}>
                  <span className="dim">
                    m{r.index} ({fn.variables.map((_, i) => (r.index >> (fn.variables.length - 1 - i)) & 1).join("")})
                  </span>
                  <span>{r.weight.toFixed(5)}</span>
                </div>
              ))}
            {theory.rows.filter((r) => r.value === 1).length > 6 && (
              <div className="tiny dim">… 其余 {theory.rows.filter((r) => r.value === 1).length - 6} 项</div>
            )}
          </div>
        </Panel>

        <Panel title="为什么模拟会有误差">
          <div className="small muted" style={{ lineHeight: 1.7 }}>
            模拟就是掷 {trials.toLocaleString()} 次“加权硬币”。频率的波动近似服从正态分布，标准差为
            <code> √(p(1−p)/n)</code>。当 p≈{theory.p1.toFixed(3)}、n={trials.toLocaleString()} 时，σ≈
            {stdErr.toFixed(4)}。
            <br />
            所以「误差不为 0」是正常的；把 n 扩大 100 倍，σ 只缩小到 1/10。
          </div>
        </Panel>

        <Panel title="学习任务">
          <ol className="stack" style={{ gap: 8 }}>
            <li className="small muted">1. 把所有概率设为 0.5，验证 P(F=1) 是否等于「1 的格数 ÷ 2ⁿ」。</li>
            <li className="small muted">2. 把 P(C) 从 0 拉到 1，观察 P(F=1) 如何从 0.25 走到 1。</li>
            <li className="small muted">3. 固定种子跑 100 次与 100000 次，比较误差的量级。</li>
          </ol>
        </Panel>

        <Panel title="常见误区">
          <ul className="stack" style={{ gap: 7 }}>
            <li className="misconception">没有声明独立就相乘，是概率题里最常见的错误。</li>
            <li className="misconception">把「互斥」当成「独立」：互斥事件通常高度不独立。</li>
            <li className="misconception">认为模拟次数越多一定越准：只是期望误差更小，单次结果仍可能偏离。</li>
          </ul>
        </Panel>
      </aside>
    </>
  );
}
