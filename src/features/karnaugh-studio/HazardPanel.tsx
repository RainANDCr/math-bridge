import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Badge, Callout, Panel } from "../../components/common";
import { analyzeHazards, type HazardReport } from "../../core/karnaugh/hazards";
import { clauseToString, termToString, type Cube } from "../../core/karnaugh/implicants";

/**
 * 冒险分析面板
 *
 * 化简只保证「稳态下函数值正确」，不保证「输入变化过程中不抖」。
 * 这里把两件常被混为一谈的事分开：
 *   · 静态冒险：两端都是同一个值，中间抖一下 —— 可以靠加共识项消除；
 *   · 功能冒险：变化前后函数值本来就不同，抖是必然的 —— 加项消不掉。
 */
export function HazardPanel({
  variables,
  values,
  sopTerms,
  posCubes,
}: {
  variables: string[];
  values: Array<0 | 1 | "X">;
  sopTerms: Cube[];
  posCubes: Cube[];
}) {
  const analysis = analyzeHazards(variables, values, sopTerms, posCubes);
  const total = analysis.ones.hazards.length + analysis.zeros.hazards.length;

  return (
    <Panel
      title="冒险分析"
      sub="化简保证稳态正确，不保证切换瞬间不抖"
      actions={
        <Badge tone={total > 0 ? "warn" : "ok"}>
          {total > 0 ? `${total} 处静态冒险` : "无静态冒险"}
        </Badge>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <div className="hazard-summary">
          {total === 0 ? (
            <>
              <ShieldCheck size={13} style={{ color: "var(--ok)" }} />
              <span>
                检查了 {analysis.ones.checkedPairs} 对相邻 1 格与 {analysis.zeros.checkedPairs} 对相邻
                0 格：每一对都能被同一项（或同一和项）覆盖，输入变化时不会出现窄脉冲。
              </span>
            </>
          ) : (
            <>
              <AlertTriangle size={13} style={{ color: "var(--warn)" }} />
              <span>
                找到 {total} 处静态冒险：相邻两格被不同的项分别覆盖，没有一项同时盖住它们。
                当那一位输入变化时，前一项已失效、后一项还没建立，输出会出现窄脉冲。
              </span>
            </>
          )}
        </div>

        <HazardSection
          report={analysis.ones}
          sourceTerms={sopTerms}
          title="静态-1 冒险（SOP）"
          formatter={(cube) => termToString(cube.literals)}
        />

        <HazardSection
          report={analysis.zeros}
          sourceTerms={posCubes}
          title="静态-0 冒险（POS）"
          formatter={(cube) => clauseToString(cube.literals)}
        />

        <Callout tone="plain">
          修复用的是共识定理：若两项只差一个文字（<code>x</code> 与 <code>¬x</code>），
          它们的共识项恰好同时覆盖那一对相邻格，加上它就能让交接期始终有一个项在托底。
          代价是覆盖不再是「最小」的 —— 这就是为什么最小化与无冒险设计是两个目标。
          <br />
          不在检测范围：<strong>功能冒险</strong>（输入同时变多位、前后函数值不同）与
          <strong>动态冒险</strong>（需要 3 条以上不同延迟的路径）。前者加项消不掉，后者要有时延模型。
        </Callout>
      </div>
    </Panel>
  );
}

function HazardSection({
  report,
  sourceTerms,
  title,
  formatter,
}: {
  report: HazardReport;
  /** 原始覆盖：冒险记录里的下标指向这一份，而不是修复后的覆盖 */
  sourceTerms: Cube[];
  title: string;
  formatter: (cube: Cube) => string;
}) {
  const isOnes = report.target === 1;
  const termsLabel = isOnes ? "乘积项" : "和项";
  if (report.checkedPairs === 0 && report.hazards.length === 0) return null;

  return (
    <div className="hazard-section">
      <div className="hazard-section__head">
        <span className="hazard-section__title">{title}</span>
        <span className="tiny dim">
          {report.hazards.length === 0
            ? `${report.checkedPairs} 对相邻格，全部安全`
            : `${report.hazards.length} 处 / 检查 ${report.checkedPairs} 对`}
        </span>
      </div>

      {report.hazards.length > 0 && (
        <>
          <div className="hazard-list">
            {report.hazards.map((hazard) => (
              <div className="hazard-row" key={`${hazard.cells[0]}-${hazard.cells[1]}`}>
                <code className="hazard-row__cells">
                  m{hazard.cells[0]} ↔ m{hazard.cells[1]}
                </code>
                <span className="hazard-row__var">{hazard.variable} 变化</span>
                <span className="hazard-row__why">
                  由 <code>{formatter(sourceTerms[hazard.terms[0]])}</code> 与{" "}
                  <code>{formatter(sourceTerms[hazard.terms[1]])}</code> 分别覆盖，
                  没有一项同时盖住两格
                </span>
              </div>
            ))}
          </div>

          <div className="hazard-fix">
            <span className="hazard-fix__label">补{termsLabel}</span>
            <div className="hazard-fix__terms">
              {report.repair.added.map((cube) => (
                <code key={`${cube.base}-${cube.mask}`}>{formatter(cube)}</code>
              ))}
            </div>
            <div className="hazard-fix__formula">
              <code>{report.repair.expression}</code>
            </div>
            <div className="hazard-fix__cost tiny dim">
              覆盖从 {report.repair.termCount - report.repair.added.length} 项变为{" "}
              {report.repair.termCount} 项，多 {report.repair.addedLiterals} 个文字 ——
              稳态结果不变，只是不再抖
            </div>
          </div>
        </>
      )}
    </div>
  );
}
