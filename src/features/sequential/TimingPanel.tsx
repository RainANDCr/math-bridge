import { useMemo, useState } from "react";
import { Clock3, Gauge } from "lucide-react";
import { Badge, Callout, Panel, Slider } from "../../components/common";
import { analyzeRaces } from "../../core/sequential/race";
import type { SequentialDerivation, StateMachine } from "../../core/sequential/machine";
import {
  buildTimingModel,
  codeText,
  simulateEdge,
  sweepSkew,
  DEFAULT_CLOCK_TO_Q,
  DEFAULT_GATE_DELAY,
  type SkewThreshold,
  type TimingModel,
  type TimingResult,
} from "../../core/sequential/timing";

/**
 * 时钟偏斜：门级延迟下的采样
 *
 * 上一块「竞争分析」给的是状态层的可能：中间码算出的次态不是目标，就可能进错状态。
 * 但它不知道时间 —— 偏斜多小算小？这里把门连起来、每级给一个延迟，回答具体的问题：
 * 偏斜到多少，后采样那一位才会真的采到错值。
 */
export function TimingPanel({
  machine,
  design,
}: {
  machine: StateMachine;
  design: SequentialDerivation;
}) {
  const report = useMemo(() => analyzeRaces(machine), [machine]);
  const model = useMemo(() => buildTimingModel(design), [design]);
  const codes = design.codes;

  const [selected, setSelected] = useState(0);
  // 状态数调小时转移列表会变短：把索引钳回有效范围，
  // 否则内容渲染的是最后一条、chip 却一个都不高亮（选中态凭空消失）
  const activeIndex = report.races.length === 0 ? 0 : Math.min(selected, report.races.length - 1);
  const race = report.races[activeIndex];

  const maxSkew = Math.min(8, Math.max(2, DEFAULT_CLOCK_TO_Q + model.maxDepth * DEFAULT_GATE_DELAY + 2));

  return (
    <Panel
      title="偏斜裕量"
      sub="门级延迟下，偏斜到多少才会真的采到错值"
      actions={
        <Badge tone="mute">
          {model.circuit.dffs.length} 位 · 最深 {model.maxDepth} 级门
        </Badge>
      }
    >
      {report.races.length === 0 ? (
        <Callout tone="plain">
          {model.circuit.dffs.length === 0
            ? "只有 1 个状态，没有状态位需要保存，也就没有「谁先翻转」这回事。"
            : "每一处转移最多只改变一位状态位。只变一位时，「晚采样」看到的是已经到位的目标状态本身，算出的次态仍然是目标次态 —— 所以偏斜再大也不会把这次转移带到别的状态上。"}
        </Callout>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          <div className="tiny dim" style={{ lineHeight: 1.7 }}>
            <Gauge size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />
            每个门 {DEFAULT_GATE_DELAY} 个时间单位延迟，触发器「时钟沿 → Q 变化」也是 {DEFAULT_CLOCK_TO_Q} 个单位；
            忽略布线延迟与建立时间窗口，短于一个门延迟的毛刺被吞掉。假设只有一位的时钟晚到。
          </div>

          <div className="timing-edges">
            {report.races.map((item, index) => (
              <button
                type="button"
                key={`${item.state}-${item.input}`}
                className={`timing-edge${index === activeIndex ? " is-active" : ""}`}
                onClick={() => setSelected(index)}
              >
                <code>
                  S{item.state}({codeText(codes[item.state] ?? 0, report.stateBits)})
                </code>
                <span className="timing-edge__arrow">
                  {machine.inputName}={item.input} →
                </span>
                <code>
                  S{item.next}({codeText(codes[item.next] ?? 0, report.stateBits)})
                </code>
                <span className="tiny dim">变 {item.changedBits.length} 位</span>
              </button>
            ))}
          </div>

          {race && (
            <TimingDetail
              key={`${race.state}-${race.input}`}
              model={model}
              from={race.state}
              input={race.input as 0 | 1}
              next={race.next}
              maxSkew={maxSkew}
            />
          )}
        </div>
      )}
    </Panel>
  );
}

function TimingDetail({
  model,
  from,
  input,
  next,
  maxSkew,
}: {
  model: TimingModel;
  from: number;
  input: 0 | 1;
  next: number;
  maxSkew: number;
}) {
  const thresholds = useMemo(() => sweepSkew(model, from, input), [model, from, input]);

  // 默认选中「最容易出事」的那一位，并把偏斜停在它开始出错的刻度上
  const worst = thresholds.reduce<SkewThreshold | null>((acc, item) => {
    if (item.failsAt === null) return acc;
    if (!acc || acc.failsAt === null || item.failsAt < acc.failsAt) return item;
    return acc;
  }, null);

  const [lateBit, setLateBit] = useState(worst?.bit ?? 0);
  const [skew, setSkew] = useState(worst?.failsAt ?? 1);
  // 换编码时位数会变（one-hot 4 位 → 二进制 2 位），选中的位可能已经不存在
  const lateIndex = Math.min(lateBit, Math.max(0, model.circuit.dffs.length - 1));

  const result = useMemo(
    () => simulateEdge(model, from, input, { gateDelay: DEFAULT_GATE_DELAY, clockToQ: DEFAULT_CLOCK_TO_Q, skew, lateBit: lateIndex }),
    [model, from, input, skew, lateIndex]
  );

  const bits = model.circuit.dffs.length;
  const codes = model.codes;
  // one-hot 的判据：每个码字恰好一位为 1。只有这种情况下「全 0」才是卡死而不是普通非法码
  const oneHot = codes.every((code) => code > 0 && (code & (code - 1)) === 0);
  const stateOf = (code: number | null) => {
    if (code === null) return "—";
    const index = codes.indexOf(code);
    return index >= 0 ? `S${index}` : "非法码";
  };

  const expectedCode = result.expectedCode;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="timing-controls">
        <div className="timing-controls__skew">
          <span className="tiny dim">偏斜 δ</span>
          <Slider value={skew} onChange={setSkew} min={0} max={maxSkew} step={0.5} label="偏斜 δ" />
          <span className="timing-value">{skew.toFixed(1)} 单位</span>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <span className="tiny dim">晚采样</span>
          {model.circuit.dffs.map((ff, index) => (
            <button
              type="button"
              key={ff.id}
              className={`timing-bit${index === lateIndex ? " is-active" : ""}`}
              onClick={() => setLateBit(index)}
            >
              {ff.q}
            </button>
          ))}
        </div>
      </div>

      <TimingWave result={result} lateBit={lateIndex} />
      <div className="timing-hint">左右滑动可查看完整波形</div>

      <div
        className={`timing-verdict is-${result.verdict}`}
        data-verdict={result.verdict}
      >
        <Clock3 size={13} />
        <span>
          {result.verdict === "ok" && (
            <>
              偏斜 {skew.toFixed(1)} 单位时，{model.circuit.dffs[lateIndex]?.q} 采样时 D
              端仍是沿前的值 —— 采到 <code>{codeText(result.code, bits)}</code>，
              正是目标状态 S{next}。
            </>
          )}
          {result.verdict === "wrong" && (
            <>
              {model.circuit.dffs[lateIndex]?.q} 在 {skew.toFixed(1)} 单位采样时，D 端已经变成另一个值 ——
              采到 <code>{codeText(result.code, bits)}</code>（应为{" "}
              <code>{codeText(expectedCode, bits)}</code>），也就是{" "}
              {stateOf(result.code)}
              {stateOf(result.code) === "非法码" ? "，不是任何合法状态" : "，而不是 S" + next}。
              {oneHot && result.code === 0 && (
                <>
                  {" "}
                  这个码没有任何一位为 1：在 one-hot 里所有 D_i 都恒为 0，一旦落进去就再也出不来 ——
                  不是「停在错误状态」，而是卡死。
                </>
              )}
            </>
          )}
          {result.verdict === "changing" && (
            <>
              {model.circuit.dffs[lateIndex]?.q} 的采样时刻正好落在 D 端的跳变上 ——
              这一瞬间的电平不确定（亚稳态），实际电路里可能采 0 也可能采 1。
              偏斜稍微再大一点就会稳定地采到{" "}
              <code>{codeText(thresholds[lateIndex]?.code ?? null, bits)}</code>。
            </>
          )}
        </span>
      </div>

      <div className="timing-table">
        <div className="timing-table__head">
          <span>晚采样的位</span>
          <span>从多少开始出错</span>
          <span>会采到</span>
        </div>
        {thresholds.map((item) => (
          <div
            className={`timing-table__row${item.bit === lateIndex ? " is-active" : ""}`}
            key={item.label}
          >
            <code>{item.label}</code>
            <span>
              {item.failsAt === null ? (
                <span className="dim">扫描范围内都安全</span>
              ) : (
                <>
                  {item.failsAt.toFixed(1)} 单位
                  {item.knife && <span className="tiny dim">（该刻度正好卡在跳变）</span>}
                </>
              )}
            </span>
            <span>
              {item.failsAt === null ? (
                <span className="dim">—</span>
              ) : (
                <>
                  <code>{codeText(item.code, bits)}</code>{" "}
                  <span className="dim">{stateOf(item.code)}</span>
                </>
              )}
            </span>
          </div>
        ))}
      </div>

      {thresholds.some((item) => item.failsAt !== null) && (
        <div className="tiny dim" style={{ lineHeight: 1.7 }}>
          阈值 = 时钟到输出（{DEFAULT_CLOCK_TO_Q}）+ 从被改位到这位 D 端的组合路径延迟。
          偏斜小于这个和时，采样发生在跳变传到 D 端之前，采到的仍是沿前的值；
          逻辑级数越浅，能容忍的偏斜越大。
        </div>
      )}
    </div>
  );
}

/**
 * 波形：时间向右，上为 1、下为 0。
 * 虚线是各触发器的采样时刻，圆点是那一瞬间 D 端采到的电平。
 */
function TimingWave({ result, lateBit }: { result: TimingResult; lateBit: number }) {
  const width = 680;
  const rowH = 30;
  const top = 26;
  const left = 52;
  const right = 14;
  const rows = result.traces;
  const height = top + rows.length * rowH + 26;
  const span = Math.max(result.horizon, 1);
  const x = (t: number) => left + (t / span) * (width - left - right);
  const center = (index: number) => top + index * rowH + rowH / 2;
  const high = (index: number) => center(index) - 8;
  const low = (index: number) => center(index) + 8;

  const sampleTimes = [...new Set(result.samples.map((sample) => sample.at))].sort((a, b) => a - b);
  const unitCount = Math.floor(span / 2);

  return (
    <div className="timing-wave">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="时钟沿前后的波形与采样时刻">
        {sampleTimes.map((time) => (
          <line
            key={`grid-${time}`}
            x1={x(time)}
            y1={top - 8}
            x2={x(time)}
            y2={top + rows.length * rowH}
            className={`timing-wave__sample${time === result.samples[lateBit]?.at ? " is-late" : ""}`}
          />
        ))}

        {sampleTimes.map((time) => (
          <text
            key={`label-${time}`}
            x={x(time)}
            y={top - 12}
            textAnchor="middle"
            className="timing-wave__tag"
          >
            {result.samples
              .filter((sample) => sample.at === time)
              .map((sample) => sample.label)
              .join(" ")}
          </text>
        ))}

        {rows.map((trace, index) => {
          let level = trace.edges[0]?.value === 1 ? high(index) : low(index);
          let path = `M ${left} ${level}`;
          for (let edgeIndex = 1; edgeIndex < trace.edges.length; edgeIndex += 1) {
            const edge = trace.edges[edgeIndex];
            const at = x(edge.t);
            path += ` H ${at.toFixed(1)}`;
            level = edge.value === 1 ? high(index) : low(index);
            path += ` V ${level}`;
          }
          path += ` H ${width - right}`;

          return (
            <g key={trace.id}>
              <text x={left - 8} y={center(index) + 4} textAnchor="end" className="timing-wave__name">
                {trace.label}
              </text>
              <line
                x1={left}
                y1={center(index)}
                x2={width - right}
                y2={center(index)}
                className="timing-wave__rail"
              />
              <path d={path} className={`timing-wave__line is-${trace.role.toLowerCase()}`} />
            </g>
          );
        })}

        {result.samples.map((sample) => {
          const index = rows.findIndex((trace) => trace.id === sample.traceId);
          if (index < 0) return null;
          const y =
            sample.value === null ? center(index) : sample.value === 1 ? high(index) : low(index);
          return (
            <circle
              key={`sample-${sample.label}`}
              cx={x(sample.at)}
              cy={y}
              r={4}
              className={`timing-wave__dot is-${sample.verdict}`}
            />
          );
        })}

        <line
          x1={left}
          y1={height - 18}
          x2={width - right}
          y2={height - 18}
          className="timing-wave__axisline"
        />
        {Array.from({ length: unitCount + 1 }, (_, tick) => tick).map((tick) => {
          const at = x(tick * 2);
          // 最后一个刻度会让位给右下角的「单位」，否则两段文字会叠在一起
          if (at > width - right - 24) return null;
          return (
            <text key={`axis-${tick}`} x={at} y={height - 6} textAnchor="middle" className="timing-wave__axis">
              {tick}
            </text>
          );
        })}
        <text x={width - right} y={height - 6} textAnchor="end" className="timing-wave__axis">
          单位
        </text>
      </svg>
    </div>
  );
}
