import { useMemo, useState } from "react";
import { Badge, Callout, Panel, Segmented } from "../../components/common";
import type { CellValue } from "../../core/boolean/model";
import type { Cube } from "../../core/karnaugh/implicants";
import { quineMcCluskey, type QmMerge } from "../../core/karnaugh/quineMcCluskey";

/**
 * 化简推导：把卡诺图的「圈组」翻译成 Quine–McCluskey 的逐步合并表。
 *
 * 这里刻意不复用 minimizer 的选择结果做「假过程」——
 * 合并过程由同一套立方体表示独立重算，覆盖表里标出的「采用」
 * 才是 minimizer 的真实输出。两者不一致会立刻暴露。
 *
 * SOP 对 1 格合并；POS 对 0 格合并再取反，所以推导要跟着当前形式走，
 * 否则会出现「表里说 1、上面显示 0」的自相矛盾。
 */
export function DerivationPanel({
  variables,
  values,
  form,
  chosen,
  expression,
}: {
  variables: string[];
  values: CellValue[];
  form: "sop" | "pos";
  chosen: Cube[];
  expression: string;
}) {
  const [view, setView] = useState<"merge" | "chart">("merge");
  const n = variables.length;
  const supported = n >= 2 && n <= 4;

  const target: CellValue = form === "sop" ? 1 : 0;
  const derivedValues = useMemo<CellValue[]>(() => {
    if (form === "sop") return values;
    return values.map((v) => (v === "X" ? "X" : v === 1 ? 0 : 1));
  }, [values, form]);

  const process = useMemo(
    () => (supported ? quineMcCluskey(variables, derivedValues, chosen) : null),
    [variables, derivedValues, chosen, supported]
  );

  if (!supported || !process) {
    return (
      <Panel title="化简推导" sub="Quine–McCluskey 合并表">
        <Callout tone="plain">
          合并表按变量逐位展开，4 个变量以内最易读。当前函数有 {n} 个变量，因此这里不展开推导。
        </Callout>
      </Panel>
    );
  }

  const termNoun = form === "sop" ? "素蕴含项" : "素和项";

  return (
    <Panel
      title="化简推导"
      sub="Quine–McCluskey 合并表"
      actions={
        <div className="row" style={{ gap: 8 }}>
          <Badge tone={form === "sop" ? "accent" : "warn"}>
            {form === "sop" ? "合并 1 格" : "合并 0 格"}
          </Badge>
          <Segmented
            value={view}
            onChange={(value) => setView(value)}
            label="推导视图"
            options={[
              { value: "merge", label: "合并过程" },
              { value: "chart", label: "覆盖表" },
            ]}
          />
        </div>
      }
    >
      {view === "merge" ? (
        <div className="stack" style={{ gap: 12 }}>
          <Callout tone="plain">
            卡诺图上圈起的每一组，就是这张表里一次（或连续几次）合并的结果：两项只有一位不同，就把那位写成{" "}
            <code>-</code>（表示这个变量被消去）。合并到不能再合并，得到的正是图上的「最大圈」。
            {form === "pos" && " POS 把 0 格当作合并目标，最后对每个乘积项取反，得到和项。"}
          </Callout>

          {process.rounds.length === 0 ? (
            <div className="empty">没有可作为合并目标的格子，无需合并。</div>
          ) : (
            <div className="qm-steps">
              {process.rounds.map((round) => {
                const count = round.groups.reduce((acc, g) => acc + g.items.length, 0);
                const primeKeys = new Set(round.primes.map((p) => p.key));
                return (
                  <div className="qm-round" key={round.round}>
                    <div className="qm-round__head">
                      <span className="qm-round__no">第 {round.round} 轮</span>
                      <span className="small muted">
                        {round.round === 1
                          ? `把每个输出为 ${target} 的格子写成二进制，按「1 的个数」分行`
                          : "把上一轮的结果继续两两合并"}
                      </span>
                      <Badge tone="mute">{count} 项</Badge>
                    </div>

                    <div className="qm-round__body">
                      <table className="qm-table">
                        <tbody>
                          {round.groups.map((group) => (
                            <tr key={group.ones}>
                              <th className="qm-table__ones">{group.ones} 个 1</th>
                              <td>
                                <div className="qm-terms">
                                  {group.items.map((item) => (
                                    <span
                                      key={item.key}
                                      className={`qm-term${primeKeys.has(item.key) ? " is-prime" : ""}`}
                                      title={`${item.expression}　覆盖 m(${item.cells.join(",")})`}
                                    >
                                      <span className="qm-term__bin">{item.binary}</span>
                                      <span className="qm-term__cells">
                                        m({item.cells.join(",")})
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {round.merges.length > 0 && (
                        <div className="qm-merges">
                          {groupMerges(round.merges).map((group) => (
                            <div className="qm-merge" key={group.to}>
                              <div className="qm-merge__sources">
                                {group.sources.map((source, i) => (
                                  <span key={i}>
                                    <code>{source.a}</code>
                                    <span className="qm-merge__op">+</span>
                                    <code>{source.b}</code>
                                  </span>
                                ))}
                              </div>
                              <span className="qm-merge__op qm-merge__arrow">→</span>
                              <code className="qm-merge__to">{group.to}</code>
                              <span className="qm-merge__why">消去 {group.variable}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {round.primes.length > 0 && (
                        <div className="qm-primes">
                          <span className="field__label">本轮不再合并 → {termNoun}</span>
                          <div className="row wrap" style={{ gap: 5 }}>
                            {round.primes.map((prime) => (
                              <span
                                className="qm-chip"
                                key={prime.key}
                                title={
                                  form === "pos"
                                    ? `${prime.expression} 覆盖 m(${prime.cells.join(",")})，取反得到 ${prime.clause}`
                                    : `${prime.expression} 覆盖 m(${prime.cells.join(",")})`
                                }
                              >
                                <code>{form === "pos" ? prime.clause : prime.expression}</code>
                                <span className="dim">
                                  {form === "pos" ? `${prime.expression} · ${prime.binary}` : prime.binary}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {process.primes.length > 0 && (
            <div className="qm-summary">
              <div className="row-between wrap" style={{ gap: 8 }}>
                <span className="field__label">
                  {termNoun}集合（{process.primes.length} 个）
                </span>
                <span className="tiny dim">
                  共 {process.rounds.length} 轮合并，得到 {process.primes.length} 个{termNoun}，其中{" "}
                  {process.rows.filter((r) => r.essential).length} 个是必需的
                </span>
              </div>
              <div className="row wrap" style={{ gap: 5, marginTop: 6 }}>
                {process.primes.map((prime) => (
                  <span className="qm-chip qm-chip--prime" key={prime.key}>
                    <code>{form === "pos" ? prime.clause : prime.expression}</code>
                    <span className="dim">
                      {form === "pos" ? `${prime.expression} · ${prime.binary}` : prime.binary}
                    </span>
                  </span>
                ))}
              </div>
              <div className="formula" style={{ marginTop: 10 }}>
                F = {expression}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <Callout tone="plain">
            每行是一个{termNoun}，每列是一个必须被覆盖的「输出为 {target}」的格子。只有一行画 ×
            的列就是必需项（★）——它只能由那一项负责，没有挑选余地。
          </Callout>

          {process.columns.length === 0 ? (
            <div className="empty">没有需要覆盖的格子，覆盖表为空。</div>
          ) : (
            <div className="qm-chart">
              <table className="qm-table qm-chart__table">
                <thead>
                  <tr>
                    <th className="qm-chart__corner">{termNoun}</th>
                    {process.columns.map((m) => (
                      <th
                        key={m}
                        className={process.essentialColumns.includes(m) ? "is-essential" : undefined}
                      >
                        m{m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {process.rows.map((row) => (
                    <tr key={row.key} className={row.chosen ? "is-chosen" : undefined}>
                      <th>
                        <code>{form === "pos" ? row.clause : row.expression}</code>
                        <span className="qm-chart__meta">
                          {row.binary} · {row.size} 格
                          {row.essential ? " · ★" : ""}
                        </span>
                      </th>
                      {process.columns.map((m) => (
                        <td key={m}>{row.covers.includes(m) ? "×" : ""}</td>
                      ))}
                    </tr>
                  ))}
                  <tr className="qm-chart__count">
                    <th>被覆盖次数</th>
                    {process.columns.map((m) => {
                      const count = process.rows.filter((row) => row.covers.includes(m)).length;
                      return (
                        <td key={m} className={count === 1 ? "is-essential" : undefined}>
                          {count}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="row wrap" style={{ gap: 6 }}>
            <Badge tone="accent">底色 = 最终采用</Badge>
            <Badge tone="ok">★ 必需项</Badge>
            <Badge tone="mute">× 覆盖该最小项</Badge>
          </div>

          <div className="formula">F = {expression}</div>
          <div className="tiny dim">
            合并表使用统一的布尔记法（¬ · +）以便逐轮对照；上方的结果会跟随你选择的符号模式。
          </div>
        </div>
      )}
    </Panel>
  );
}

/** 同一结果可能有多对来源，合并到一组显示，避免「某项莫名消失」 */
function groupMerges(merges: QmMerge[]) {
  const map = new Map<
    string,
    { to: string; variable: string; sources: Array<{ a: string; b: string }> }
  >();
  for (const merge of merges) {
    const hit = map.get(merge.to);
    if (hit) hit.sources.push({ a: merge.a, b: merge.b });
    else
      map.set(merge.to, {
        to: merge.to,
        variable: merge.variable,
        sources: [{ a: merge.a, b: merge.b }],
      });
  }
  return [...map.values()];
}
