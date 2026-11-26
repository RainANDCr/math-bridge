import { Badge, Panel } from "../../components/common";
import type { DesignComparison } from "../../core/sequential/comparison";

/**
 * 四种组合的代价对比
 *
 * 同一台机器：化简前 / 化简后 × 二进制 / one-hot，四条路都真推导一遍，
 * 用同一套计价规则（文字数、乘积项数、方程条数）摆在一起。
 *
 * 有两件事容易混：
 *   · 状态数减少不等于触发器减少 —— 二进制只有跨过 2 的幂才会少一位；
 *   · one-hot 的触发器数就等于状态数，所以状态减少一个就少一个触发器。
 * 所以「省了几个触发器」必须按当前编码分别算，不能只报二进制的那一个数。
 */
export function CostComparePanel({ comparison }: { comparison: DesignComparison }) {
  const { variants, changed, reducedCount } = comparison;
  const binaryBefore = variants[0];
  const onehotBefore = variants[1];
  const binaryAfter = variants[2];
  const onehotAfter = variants[3];

  const binarySaving = binaryBefore.flipFlops - binaryAfter.flipFlops;
  const onehotSaving = onehotBefore.flipFlops - onehotAfter.flipFlops;
  const active = variants.find((variant) => variant.current) ?? binaryAfter;
  const activeSaving = active.encoding === "onehot" ? onehotSaving : binarySaving;

  return (
    <Panel
      title="编码与化简的代价"
      sub="当前机器与化简结果并排比较，同一套计价规则"
      actions={
        <Badge tone={changed && activeSaving > 0 ? "accent" : "mute"}>
          {!changed
            ? `当前 ${variants[0].stateCount} 个状态 · ${variants[0].bits} 位`
            : activeSaving > 0
            ? `化简省 ${activeSaving} 个触发器`
            : "状态减少，位宽不变"}
        </Badge>
      }
    >
      <div className="stack" style={{ gap: 10 }}>
        <div className="table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th>方案</th>
                <th>状态</th>
                <th>触发器</th>
                <th>方程</th>
                <th>文字</th>
                <th>乘积项</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((variant) => (
                <tr
                  key={variant.key}
                  className={`${variant.current ? "is-current" : ""}${
                    variant.duplicated ? " is-duplicated" : ""
                  }`}
                >
                  <td>
                    <span className="compare-table__name">{variant.label}</span>
                    <span className="tiny dim">
                      {variant.duplicated ? "（化简无变化）" : variant.detail}
                    </span>
                  </td>
                  <td className="mono-td">{variant.stateCount}</td>
                  <td className="mono-td">
                    <strong>{variant.flipFlops}</strong>
                  </td>
                  <td className="mono-td">{variant.equations}</td>
                  <td className="mono-td">{variant.literals}</td>
                  <td className="mono-td">{variant.terms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="compare-summary">
          {changed ? (
            <>
              状态从 {binaryBefore.stateCount} 个减到 {reducedCount} 个。二进制：
              {binarySaving > 0 ? (
                <>
                  位宽从 {binaryBefore.bits} 位降到 {binaryAfter.bits} 位，
                  <strong>省 {binarySaving} 个触发器</strong>
                </>
              ) : (
                <>
                  位宽仍是 {binaryAfter.bits} 位 —— <strong>只有跨过 2 的幂才会少一位</strong>，
                  省下的是方程与无效状态
                </>
              )}
              ；one-hot：触发器从 {onehotBefore.flipFlops} 个降到 {onehotAfter.flipFlops} 个
              {onehotSaving > 0 ? `，省 ${onehotSaving} 个` : ""}。
            </>
          ) : (
            <>
              当前就是化简后的机器，四行的差别只剩编码方案。
              二进制用 {binaryAfter.flipFlops} 个触发器、{binaryAfter.literals} 个文字；
              one-hot 用 {onehotAfter.flipFlops} 个触发器、{onehotAfter.literals} 个文字。
            </>
          )}
        </div>

        <div className="tiny dim" style={{ lineHeight: 1.7 }}>
          one-hot 要 {onehotAfter.flipFlops} 个触发器，二进制只要 {binaryAfter.flipFlops} 个；
          在这个例子里文字数是 {onehotAfter.literals} 对 {binaryAfter.literals}，
          {onehotAfter.literals <= binaryAfter.literals ? "并没有变多" : "反而更多"} ——
          它买的不是文字数，而是「每条 D 只依赖源状态那一位和输入」：一级与或、扇入固定、不必画卡诺图。
          状态越多，这笔交换越划算；状态很少时，多出来的触发器换不回多少门。
          触发器便宜、门贵时选 one-hot，反过来选二进制 —— 这是工艺决定的，不是数学决定的。
        </div>
      </div>
    </Panel>
  );
}
