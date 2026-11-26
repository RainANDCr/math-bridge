import type { SimulationCheckpoint } from "../../core/probability/simulation";

/**
 * 收敛曲线
 *
 * 横轴为对数刻度的试验次数（否则 10 万次之后的点会全部挤在右侧），
 * 纵轴按数据范围自适应，并画出 ±2σ 的理论波动带：
 * 曲线应该始终落在带子附近，否则说明抽样有问题。
 */

const W = 640;
const H = 208;
const M = { top: 12, right: 14, bottom: 26, left: 44 };

function logTicks(total: number): number[] {
  const ticks: number[] = [];
  for (let v = 1; v <= total; v *= 10) ticks.push(v);
  return ticks;
}

export function ConvergenceChart({
  checkpoints,
  theory,
  total,
}: {
  checkpoints: SimulationCheckpoint[];
  theory: number;
  total: number;
}) {
  if (checkpoints.length === 0 || total <= 1) {
    return (
      <div className="empty" style={{ padding: 20 }}>
        运行模拟后这里会出现收敛曲线
      </div>
    );
  }

  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const maxLog = Math.log10(total);

  // 前 10 次试验的波动没有统计意义，从曲线中剔除，避免把纵轴拉满
  const visible = checkpoints.filter((c) => c.trials >= Math.min(10, total));

  const bandPoints: Array<{ n: number; upper: number; lower: number }> = [];
  for (let i = 0; i <= 60; i += 1) {
    const n = Math.max(10, Math.round(10 ** ((i / 60) * maxLog)));
    const sigma = Math.sqrt(Math.max(0, theory * (1 - theory)) / n);
    bandPoints.push({ n, upper: theory + 2 * sigma, lower: theory - 2 * sigma });
  }

  const values = visible.map((c) => c.frequency);
  let yMin = Math.min(theory, ...values);
  let yMax = Math.max(theory, ...values);
  const pad = Math.max(0.006, (yMax - yMin) * 0.25);
  yMin = Math.max(0, yMin - pad);
  yMax = Math.min(1, yMax + pad);
  if (yMax - yMin < 0.012) {
    const mid = (yMax + yMin) / 2;
    yMin = Math.max(0, mid - 0.006);
    yMax = Math.min(1, mid + 0.006);
  }

  const sx = (n: number) => M.left + (Math.log10(Math.max(1, n)) / maxLog) * innerW;
  const sy = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const clampY = (v: number) => Math.min(yMax, Math.max(yMin, v));

  const linePath = visible
    .map((c, i) => `${i === 0 ? "M" : "L"} ${sx(c.trials).toFixed(2)} ${sy(c.frequency).toFixed(2)}`)
    .join(" ");

  const bandPath = [
    ...bandPoints.map(
      (b, i) => `${i === 0 ? "M" : "L"} ${sx(b.n).toFixed(2)} ${sy(clampY(b.upper)).toFixed(2)}`
    ),
    ...[...bandPoints].reverse().map(
      (b) => `L ${sx(b.n).toFixed(2)} ${sy(clampY(b.lower)).toFixed(2)}`
    ),
    "Z",
  ].join(" ");

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + (yMax - yMin) * t);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="模拟频率收敛曲线">
      <rect x={0} y={0} width={W} height={H} fill="transparent" />

      <path d={bandPath} fill="var(--accent-soft)" opacity={0.55} />

      {yTicks.map((v) => (
        <g key={v} className="chart__grid">
          <line x1={M.left} y1={sy(v)} x2={W - M.right} y2={sy(v)} />
          <text x={M.left - 8} y={sy(v) + 3} textAnchor="end" className="chart__axis" fill="var(--text-mute)">
            {v.toFixed(3)}
          </text>
        </g>
      ))}

      {logTicks(total).map((t) => (
        <text
          key={t}
          x={sx(t)}
          y={H - 8}
          textAnchor="middle"
          className="chart__axis"
          fill="var(--text-mute)"
        >
          {t >= 1000 ? `${t / 1000}k` : t}
        </text>
      ))}

      <line className="chart__theory" x1={M.left} y1={sy(theory)} x2={W - M.right} y2={sy(theory)} />
      <text
        x={M.left + 5}
        y={sy(theory) - 5}
        textAnchor="start"
        className="chart__label"
        fill="var(--warn)"
      >
        理论 {theory.toFixed(4)}
      </text>

      <path className="chart__line" d={linePath} />

      <text
        x={W - M.right}
        y={M.top + 8}
        textAnchor="end"
        className="chart__label"
        fill="var(--text-mute)"
      >
        模拟频率
      </text>
    </svg>
  );
}

export function CompareBars({
  theory,
  simulated,
}: {
  theory: number;
  simulated: number | null;
}) {
  const rows = [
    { label: "理论概率", value: theory, tone: "mute" },
    { label: "模拟频率", value: simulated, tone: "accent" },
  ];
  return (
    <div className="bars">
      {rows.map((row) => (
        <div className="bar-row" key={row.label}>
          <span className="bar-label">{row.label}</span>
          <div className="bar-track">
            <div
              className={`bar-fill ${row.tone === "mute" ? "bar-fill--mute" : ""}`}
              style={{ width: `${Math.max(0, Math.min(1, row.value ?? 0)) * 100}%` }}
            />
          </div>
          <span className="bar-value">{row.value === null ? "—" : row.value.toFixed(4)}</span>
        </div>
      ))}
    </div>
  );
}
