import { ArrowRight, BookOpen } from "lucide-react";
import { Badge, Button, Callout, Panel } from "../../components/common";
import { CONCEPTS } from "../../core/knowledge/concepts";
import { OPERATORS } from "../../core/notation/notationRegistry";
import { useApp } from "../../store/appStore";

const RULES = [
  ["分组大小", "只能是 1、2、4、8、16 个格子，即 2ᵏ。"],
  ["相邻判据", "两个格子对应的最小项只差一个变量（二进制只差一位）。"],
  ["边界环绕", "最左列与最右列相邻，最上行与最下行相邻。"],
  ["四角", "四个角在逻辑上两两相邻，可以合成一个 4 格分组。"],
  ["对角线", "对角的两格差两位，不能合并。"],
  ["无关项", "X 可以参与分组来帮助化简，但不是必须覆盖。"],
  ["重叠", "分组之间允许重叠，同一个 1 可以被多个分组覆盖。"],
  ["目标", "用最少的分组覆盖所有 1（本项目按“项数优先、文字数次优”求全局最优）。"],
];

const LAWS = [
  ["交换律", "A + B = B + A，A·B = B·A"],
  ["结合律", "A + (B + C) = (A + B) + C"],
  ["分配律", "A·(B + C) = A·B + A·C，A + B·C = (A + B)(A + C)"],
  ["同一律", "A + 0 = A，A·1 = A"],
  ["零一律", "A + 1 = 1，A·0 = 0"],
  ["幂等律", "A + A = A，A·A = A"],
  ["互补律", "A + ¬A = 1，A·¬A = 0"],
  ["吸收律", "A + A·B = A，A·(A + B) = A"],
  ["德摩根律", "¬(A·B) = ¬A + ¬B，¬(A + B) = ¬A·¬B"],
];

export function Reference() {
  const { actions } = useApp();
  return (
    <>
      <main className="studio__main">
        <div className="page-head">
          <div className="page-head__text">
            <h2>概念与规则速查</h2>
            <p>运算符、优先级、卡诺图规则、布尔代数恒等式与概率假设，都在这一页。</p>
          </div>
          <div className="page-head__actions">
            <Badge tone="mute">{CONCEPTS.length} 个概念</Badge>
          </div>
        </div>

        <div className="grid-2" style={{ alignItems: "start" }}>
          <Panel title="运算符" sub="同一个运算有多种写法" actions={<Badge tone="mute">8 种</Badge>}>
            <table className="op-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>主要符号</th>
                  <th>含义</th>
                </tr>
              </thead>
              <tbody>
                {OPERATORS.map((op) => (
                  <tr key={op.id}>
                    <td>
                      {op.zh}
                      <span className="tiny dim"> {op.en.split(" / ")[0]}</span>
                    </td>
                    <td className="mono-td">{(op.symbols.length > 0 ? op.symbols : [op.glyph]).join("  ")}</td>
                    <td>{op.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Callout tone="plain">
              同级运算从左到右结合，括号优先。输入时允许混用不同写法，例如{" "}
              <code>¬A ∧ (B ∨ C)</code> 与 <code>AB' + C</code> 都会被统一解析。
              各写法的完整对照、语境差异与常见混淆，见符号百科。
            </Callout>
            <Button
              style={{ marginTop: 8 }}
              icon={<ArrowRight size={13} />}
              onClick={() => actions.setStudio("notation")}
            >
              打开跨学科符号百科
            </Button>
          </Panel>

          <Panel title="卡诺图规则">
            <table className="op-table">
              <tbody>
                {RULES.map(([key, value]) => (
                  <tr key={key}>
                    <td style={{ width: 88, color: "var(--text)", fontWeight: 500 }}>{key}</td>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>

        <div className="grid-2" style={{ marginTop: 14, alignItems: "start" }}>
          <Panel title="布尔代数恒等式" sub="化简的每一步都能引用其中一条">
            <table className="op-table">
              <tbody>
                {LAWS.map(([name, formula]) => (
                  <tr key={name}>
                    <td style={{ width: 82, color: "var(--text)", fontWeight: 500 }}>{name}</td>
                    <td className="mono-td">{formula}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title="概率计算的三个前提">
            <div className="stack" style={{ gap: 10 }}>
              <Callout tone="warn">
                <strong>1. 输入变量相互独立。</strong> 所以 P(x) = ∏ P(Xᵢ = xᵢ)。
                若变量相关，必须改用条件概率，不能直接相乘。
              </Callout>
              <Callout tone="plain">
                <strong>2. 每个变量的取值只有 0 / 1。</strong> 因此 P(X=0) = 1 − P(X=1)。
              </Callout>
              <Callout tone="plain">
                <strong>3. 无关项会让答案变成区间。</strong> 含 X 时，P(F=1) 的下界把所有 X 当 0，
                上界把所有 X 当 1。
              </Callout>
              <div className="small muted" style={{ lineHeight: 1.7 }}>
                在这个模型下，P(F=1) 就是「让 F=1 的那些输入组合的概率之和」。
                当所有输入都是 0.5 时，它恰好等于「1 的格数 ÷ 2ⁿ」。
              </div>
            </div>
          </Panel>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="section-head">
            <h2>
              <BookOpen size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
              概念速查
            </h2>
            <span className="hint">定义 · 形式化 · 跨课程对应</span>
          </div>
          <div className="ref-grid">
            {CONCEPTS.map((concept) => (
              <article className="ref-card" key={concept.id}>
                <div className="ref-card__head">
                  <span className="ref-card__term">{concept.zh}</span>
                  <span className="ref-card__en">{concept.en}</span>
                </div>
                <div className="formula">{concept.formula}</div>
                <p>{concept.definition}</p>
                <div className="concept-cross">
                  {concept.cross.map((item) => (
                    <div className="concept-cross__row" key={item.domain + item.text}>
                      <span className="concept-cross__tag">{item.domain}</span>
                      <span>{item.text}</span>
                    </div>
                  ))}
                </div>
                <div className="misconception">{concept.misconceptions[0]}</div>
              </article>
            ))}
          </div>
        </div>
      </main>

      <aside className="inspector" aria-label="使用说明">
        <Panel title="怎么读这个站点">
          <ol className="stack" style={{ gap: 9 }}>
            <li className="small muted">
              <strong style={{ color: "var(--text)" }}>逻辑工作台</strong>：认识表达式、真值表与门；
              顺手看「冗余项与布尔除法」——最简之外还有没有白写的项。
            </li>
            <li className="small muted">
              <strong style={{ color: "var(--text)" }}>卡诺图工作室</strong>：学会把函数化到最简，
              再看「冒险分析」：化简保证稳态正确，切换瞬间是另一回事。
            </li>
            <li className="small muted">
              <strong style={{ color: "var(--text)" }}>多输出化简</strong>：代价不是「门越少越好」，
              而是共享项省了什么、又多付了什么。
            </li>
            <li className="small muted">
              <strong style={{ color: "var(--text)" }}>时序逻辑</strong>：状态表 → 化简 → 编码 →
              竞争 → 偏斜裕量 → 门级电路，一路走到「偏斜到多少才真的采错」。
            </li>
            <li className="small muted">
              <strong style={{ color: "var(--text)" }}>门级搭建</strong>：先连电路，再反推表达式 ——
              验证「我搭的确实是我想要的」。
            </li>
            <li className="small muted">
              <strong style={{ color: "var(--text)" }}>概率实验室</strong>：把布尔函数当成随机事件；
              再关掉「输入独立」这个假设，看 P(F=1) 怎么变。
            </li>
            <li className="small muted">
              <strong style={{ color: "var(--text)" }}>知识连接</strong>：看清这些视角为什么是同一件事。
            </li>
          </ol>
        </Panel>

        <Panel title="术语约定">
          <div className="stack" style={{ gap: 8 }}>
            {[
              ["最小项", "Minterm，使函数为 1 的那一行对应的乘积项，编号 m₀…m₂ⁿ₋₁。"],
              ["最大项", "Maxterm，使函数为 0 的那一行对应的和项。"],
              ["SOP", "Sum of Products，与或式，先与后或。"],
              ["POS", "Product of Sums，或与式，先或后与。"],
              ["蕴含项", "Implicant，可以合并成一组的所有 1 格构成的乘积项。"],
              ["素蕴含项", "Prime Implicant，不能再被更大分组包含的蕴含项。"],
              ["无关项", "Don't care，输出值不被约束的输入组合。"],
            ].map(([term, desc]) => (
              <div key={term}>
                <div className="small" style={{ fontWeight: 600 }}>
                  {term}
                </div>
                <div className="tiny dim" style={{ lineHeight: 1.6 }}>
                  {desc}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="本项目的边界">
          <div className="small muted" style={{ lineHeight: 1.7 }}>
            <p style={{ margin: "0 0 8px" }}>
              已支持：2–6 变量卡诺图（5–6 变量自动分页）、SOP / POS、无关项、手动分组、
              多输出共享与子表达式提取、静态冒险检测与共识项修复、布尔除法（含冗余项）、
              状态化简与编码搜索（二进制 / one-hot）、Mealy / Moore 状态机（D、JK 触发器）、
              时序电路的门级生成、竞争分析与门级延迟下的偏斜裕量、
              输入相关性建模（联合分布）、门级搭建、五种学科记法。
            </p>
            <p style={{ margin: 0 }}>
              尚未支持：功能冒险与动态冒险、时序电路的层次化封装与总线、
              按门级深度给 one-hot 与二进制分别计价；偏斜只按「一位晚到、其余同时」扫描，
              门级延迟是等延迟的简化模型（不含扇出差异与建立保持窗口）。
              完整清单见 README 的「已知限制与后续计划」。
            </p>
          </div>
        </Panel>
      </aside>
    </>
  );
}
