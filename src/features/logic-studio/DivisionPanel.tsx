import { useMemo } from "react";
import { Scissors } from "lucide-react";
import { Badge, Callout, Panel } from "../../components/common";
import type { BoolNode } from "../../core/boolean/ast";
import type { CellValue } from "../../core/boolean/model";
import {
  bestBooleanFactors,
  cubeFromLiterals,
  pruneRedundantTerms,
  sopTermsFromAst,
  twoLevelLiterals,
} from "../../core/karnaugh/division";
import { termToString, type Cube } from "../../core/karnaugh/implicants";

/**
 * 冗余项与布尔除法
 *
 * 化简回答的是「最小覆盖是什么」；这一块回答另一个问题：
 * 「你写的这个式子，有没有白写的项？有没有代数除法看不见的公因子？」
 *
 * 例：A·B + ¬A·C + B·C 里的 B·C 是前两项的共识项，删掉函数不变；
 *    而 A·B + ¬A·C 虽然没有任何公共文字，却等于 (A + C)·(¬A + B)。
 *    后者靠布尔除法找到，代数除法永远找不到。
 */
export function DivisionPanel({
  ast,
  variables,
  values,
}: {
  ast: BoolNode;
  variables: string[];
  values: CellValue[];
}) {
  const analysis = useMemo(() => {
    const literalTerms = sopTermsFromAst(ast);
    if (!literalTerms) return { kind: "not-sop" as const };

    const cubes = literalTerms.map((literals) => cubeFromLiterals(literals, variables));

    // 展开结果必须和真值表一致，否则说明它不是「乘积项之和」（例如 A·¬A 的矛盾项）
    let consistent = true;
    for (let row = 0; row < values.length && consistent; row += 1) {
      if (values[row] === "X") continue;
      const covered = cubes.some((cube) => cube.cells.includes(row));
      if (covered !== (values[row] === 1)) consistent = false;
    }
    if (!consistent) return { kind: "not-sop" as const };

    const { terms, removed } = pruneRedundantTerms(variables, values, cubes);
    const factors = bestBooleanFactors(variables, values, terms);
    return { kind: "ok" as const, terms, removed, factors };
  }, [ast, variables, values]);

  return (
    <Panel
      title="冗余项与布尔除法"
      sub="最小覆盖之外：有没有白写的项，有没有代数除法看不见的公因子"
      actions={
        <Badge tone="mute">
          <Scissors size={10} /> 布尔除法
        </Badge>
      }
    >
      {analysis.kind === "not-sop" ? (
        <Callout tone="plain">
          当前表达式不是「乘积项之和」的形状（含异或、或嵌套取反），无法按项检查。
          先展开成与或式，或直接看卡诺图结果。
        </Callout>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <div className="division-terms">
            <span className="field__label">展开为 {analysis.terms.length + analysis.removed.length} 个乘积项</span>
            <div className="division-terms__list">
              {analysis.terms.map((cube, index) => (
                <code key={`keep-${index}`}>{formatCube(cube)}</code>
              ))}
              {analysis.removed.map((item, index) => (
                <code className="is-redundant" key={`drop-${index}`}>
                  {item.text}
                </code>
              ))}
            </div>
          </div>

          {analysis.removed.length > 0 ? (
            <div className="division-section">
              <div className="division-section__head">
                <span className="division-section__title">冗余项</span>
                <Badge tone="warn">{analysis.removed.length} 个可删</Badge>
              </div>
              <div className="division-removed">
                {analysis.removed.map((item, index) => (
                  <div className="division-removed__row" key={index}>
                    <code>{item.text}</code>
                    <span className="tiny dim">
                      它的每一格都被其余项覆盖 —— 删掉它，函数不变
                    </span>
                  </div>
                ))}
              </div>
              <div className="division-formula">
                {analysis.terms.map((cube) => formatCube(cube)).join(" + ")}
              </div>
            </div>
          ) : (
            <Callout tone="plain">
              没有冗余项：每个乘积项至少有一个格子只有它覆盖，删掉任何一个都会改变函数。
              最小覆盖本来就不会留下共识项。
            </Callout>
          )}

          {analysis.factors.length > 0 ? (
            <div className="division-section">
              <div className="division-section__head">
                <span className="division-section__title">布尔除法找到的精确因子</span>
                <span className="tiny dim">D · Q = F</span>
              </div>
              <div className="division-factors">
                {analysis.factors.map((factor) => {
                  const baseline =
                    twoLevelLiterals(analysis.terms) + Math.max(1, analysis.terms.length);
                  const delta = baseline - factor.cost;
                  return (
                    <div className="division-factor" key={factor.divisorText}>
                      <div className="division-factor__form">
                        <code>
                          {factor.divisorText} · ({factor.quotientText})
                        </code>
                      </div>
                      <span
                        className={`division-factor__cost${
                          delta > 0 ? " is-better" : delta === 0 ? " is-even" : " is-worse"
                        }`}
                      >
                        {delta > 0 ? `省 ${delta}` : delta === 0 ? "持平" : `多 ${-delta}`} · 代价{" "}
                        {factor.cost} / 两级 {baseline}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="tiny dim" style={{ lineHeight: 1.7 }}>
                布尔除法的商不是「文字相消」得来的：在除式为 1 的行上商必须等于被除式，
                除式为 0 的行对商是无关项 —— 正是这些无关项让 (A + C) 成为因子。
                代价按「文字数 + 门数」粗估；省不省要看具体工艺，所以这里两个数都摆出来。
              </div>
            </div>
          ) : (
            <Callout tone="plain">
              没有找到精确的布尔因子（除式必须是被除式的蕴含项才可能整除）。
              这不是失败：多数与或式本来就没有更低代价的因式形式。
            </Callout>
          )}
        </div>
      )}
    </Panel>
  );
}

function formatCube(cube: Cube): string {
  return cube.literals.length === 0 ? "1" : termToString(cube.literals);
}
