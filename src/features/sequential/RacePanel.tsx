import { useMemo } from "react";
import { GitBranch } from "lucide-react";
import { Badge, Callout, Panel } from "../../components/common";
import { analyzeRaces } from "../../core/sequential/race";
import { stateCodesOf, type StateMachine } from "../../core/sequential/machine";

/**
 * 竞争分析面板
 *
 * 同步电路在时钟沿同时更新状态位，次态用的是沿前的稳定状态 —— 本来没有竞争。
 * 这里检查的是「各位到达有先后」的情形：异步时序、时钟偏斜、或路径延迟差很大时，
 * 电路会不会在中间码字上被带到别的稳定状态。
 */
export function RacePanel({ machine }: { machine: StateMachine }) {
  const report = useMemo(() => analyzeRaces(machine), [machine]);
  // 中间码字全都不落在状态上的转移（例如 one-hot）无法推演，单独归一类
  const evaluable = report.races.filter((race) => race.intermediates.length > 0);
  const codes = stateCodesOf(machine);
  const codeOf = (state: number) => codes[state].toString(2).padStart(report.stateBits, "0");

  return (
    <Panel
      title="竞争分析"
      sub="时钟偏斜时，后采样的触发器会不会按「部分已更新的状态」算错次态"
      actions={
        <Badge
          tone={report.criticalCount > 0 ? "warn" : evaluable.length > 0 ? "mute" : "ok"}
        >
          {report.criticalCount > 0
            ? `${report.criticalCount} 处临界竞争`
            : evaluable.length > 0
            ? `${evaluable.length} 处非临界竞争`
            : report.races.length > 0
            ? `${report.races.length} 处多位置变化`
            : "无竞争"}
        </Badge>
      }
    >
      <div className="stack" style={{ gap: 10 }}>
        <div className="race-intro">
          <GitBranch size={13} style={{ color: "var(--text-mute)" }} />
          <span>
            检查了 {report.checked} 条转移。同步电路在时钟沿同时更新所有位，次态逻辑读的是沿前的稳定状态，
            所以<strong>理想同步设计本身不看竞争</strong>；下面查的是时钟偏斜时「部分位已更新」的情形。
          </span>
        </div>

        {report.races.length === 0 ? (
          <Callout tone="plain">
            每一处转移最多只改变一位状态位，不存在「谁先到」的问题，也就没有竞争。
          </Callout>
        ) : evaluable.length === 0 ? (
          <Callout tone="plain">
            有 {report.races.length} 处转移同时改变了两位以上，但中间码字（如{" "}
            {report.races[0].invalidCodes.slice(0, 2).join("、")}
            ）都不落在任何合法状态上 —— 这是 one-hot 的正常现象，用状态模型推演不出结论；
            实际电路里它们只是短暂的非法码，不会停在某个错误状态上。
          </Callout>
        ) : (
          <div className="race-list">
            {evaluable.map((race) => (
              <div
                className={`race-row${race.critical ? " is-critical" : ""}`}
                key={`${race.state}-${race.input}`}
              >
                <div className="race-row__head">
                  <code className="race-row__edge">
                    S{race.state}({codeOf(race.state)}) — {machine.inputName}={race.input} → S
                    {race.next}({codeOf(race.next)})
                  </code>
                  <span className="tiny dim">变 {race.changedBits.length} 位</span>
                  <Badge tone={race.critical ? "warn" : "mute"}>
                    {race.critical ? "临界" : "非临界"}
                  </Badge>
                </div>

                <div className="race-row__paths">
                  {race.outcomes.map((outcome, index) => (
                    <span
                      className={`race-row__path${
                        outcome.next !== race.next ? " is-other" : ""
                      }`}
                      key={`${outcome.via}-${index}`}
                    >
                      {outcome.viaCode === null ? (
                        <>直达</>
                      ) : (
                        <code>{outcome.viaCode}</code>
                      )}
                      {" → "}
                      S{outcome.next}
                      {outcome.next === race.next ? "（正确）" : "（会进错状态）"}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="tiny dim" style={{ lineHeight: 1.7 }}>
          判据：两位以上同时变化时，把「后采样时可能看到的部分更新状态」都算一遍次态；
          若存在某个中间状态算出的次态不是目标状态，就是临界竞争（可能进错状态）；
          全部都等于目标状态则是非临界竞争（有竞争，但无害）。
          缩小竞争最直接的办法是改编码，让相邻状态只差一位 —— 这也正是格雷码计数器的意义。
          <br />
          这一层只说「可能」。偏斜要多大才会真的踩到中间码，取决于门的级数 —— 见下面的「偏斜裕量」。
        </div>
      </div>
    </Panel>
  );
}
