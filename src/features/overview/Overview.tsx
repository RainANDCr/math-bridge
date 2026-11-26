import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Binary,
  Download,
  Dice5,
  LayoutGrid,
  ShieldCheck,
  Sigma,
  Trash2,
  Upload,
} from "lucide-react";
import { useApp } from "../../store/appStore";
import { Badge, Button, Callout, Panel, Stat } from "../../components/common";
import { parseExperimentJson } from "../../store/persistence";
import { ROUTES } from "../../app/routes";
import { minimizeValues } from "../../core/karnaugh/minimizer";
import { mintermList, mintermNotation } from "../../core/boolean/model";

const EXAMPLES = [
  { expr: "F = A·B", goal: "最小的“与”：只有在 A、B 同时为 1 的那一行，输出才为 1。" },
  { expr: "F = A + B", goal: "“或”覆盖三个最小项，卡诺图上会合并成一个 2 格 + 1 格的分组。" },
  { expr: "F = A·B + C", goal: "化简的典型：4 项的 C 加 1 个补丁 A·B，就从 5 个最小项压到 2 项。" },
  { expr: "F = A·B′ + A′·B", goal: "这是异或：两项都无法再合并，说明它已经是“本质复杂”的。" },
  { expr: "F = (A & B) | (A & !B)", goal: "看起来有两项，其实等于 A —— 吸收律的直观证据。" },
];

function MiniBridge() {
  const rows = [
    { title: "离散数学", sub: "命题 · 布尔代数", color: "var(--accent)" },
    { title: "概率论", sub: "事件 · 随机实验", color: "var(--violet)" },
    { title: "数字电路", sub: "逻辑门 · 化简", color: "var(--g2)" },
  ];
  const bridges = ["同一套运算律", "同一张真值表"];

  return (
    <div className="bridge-map-wrap">
    <svg className="bridge-map" viewBox="0 0 300 186" role="img" aria-label="三门课程关系概览">
      {rows.map((row, i) => {
        const y = 6 + i * 60;
        return (
          <g key={row.title}>
            <rect x={14} y={y} width={272} height={44} rx={8} fill="var(--panel-2)" stroke="var(--line)" />
            <rect x={14} y={y} width={3} height={44} rx={1.5} fill={row.color} />
            <text x={30} y={y + 19} fontSize={12} fontWeight={600} fill="var(--text)">
              {row.title}
            </text>
            <text x={30} y={y + 34} fontSize={10} fill="var(--text-mute)">
              {row.sub}
            </text>
            {i < rows.length - 1 && (
              <g>
                <line
                  x1={150}
                  y1={y + 46}
                  x2={150}
                  y2={y + 54}
                  stroke="var(--line-strong)"
                  strokeWidth={1.2}
                  strokeDasharray="2 2"
                />
                <path
                  d={`M 146 ${y + 53} L 150 ${y + 58} L 154 ${y + 53}`}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={1.3}
                  strokeLinecap="round"
                />
                <text x={162} y={y + 56} fontSize={9.5} fill="var(--text-mute)">
                  {bridges[i]}
                </text>
              </g>
            )}
          </g>
        );
      })}
      <text x={14} y={180} fontSize={9.5} fill="var(--text-mute)">
        合取 = 交集 = AND　·　析取 = 并集 = OR
      </text>
    </svg>
    </div>
  );
}

export function Overview() {
  const { state, actions, lastSavedAt } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingClear, setPendingClear] = useState(false);

  const sop = useMemo(
    () => (state.fn.variables.length ? minimizeValues(state.fn.variables, state.fn.values) : null),
    [state.fn]
  );

  const load = (expr: string) => {
    const result = actions.applyExpression(expr);
    if (result.ok) actions.setStudio("karnaugh");
  };

  const exportJson = () => {
    const text = actions.exportExperiment();
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    anchor.href = url;
    anchor.download = `mathbridge-${stamp}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    actions.notify("ok", "实验已导出为 JSON 文件");
  };

  const importJson = async (file: File) => {
    const text = await file.text();
    const result = parseExperimentJson(text);
    if (!result.ok || !result.data) {
      actions.notify("error", `导入失败：${result.error ?? "文件结构不正确"}`);
      return;
    }
    actions.importExperiment(result.data);
  };

  return (
    <>
      <main className="studio__main">
        <div className="hero">
          <div className="hero__eyebrow">MATH BRIDGE · KARNAUGH MAP STUDIO</div>
          <h1>把离散数学、概率论和数字电路，看成同一个东西</h1>
          <p>
            一个布尔函数可以有四种长相：一个逻辑表达式、一张真值表、一幅卡诺图、一张门级电路。
            在这里,它们是同一个对象的四个视图 —— 改一处，其余全部同步，而且每一步都可以验证。
          </p>
          <div className="hero__actions">
            <Button variant="primary" size="lg" icon={<LayoutGrid size={14} />} onClick={() => actions.setStudio("karnaugh")}>
              打开卡诺图工作室
            </Button>
            <Button size="lg" icon={<Binary size={14} />} onClick={() => actions.setStudio("logic")}>
              从逻辑工作台开始
            </Button>
          </div>
        </div>

        <div className="quick-cards" style={{ marginTop: 14 }}>
          <button type="button" className="quick-card" onClick={() => actions.setStudio("logic")}>
            <span className="quick-card__icon">
              <Binary size={16} />
            </span>
            <span className="quick-card__title">
              逻辑工作台 <ArrowRight size={12} />
            </span>
            <span className="quick-card__desc">输入表达式，立刻得到真值表、电路与表达式结构树。</span>
          </button>
          <button type="button" className="quick-card" onClick={() => actions.setStudio("karnaugh")}>
            <span className="quick-card__icon">
              <LayoutGrid size={16} />
            </span>
            <span className="quick-card__title">
              卡诺图工作室 <ArrowRight size={12} />
            </span>
            <span className="quick-card__desc">自动分组求最简 SOP/POS，也可以自己圈组并校验合法性。</span>
          </button>
          <button type="button" className="quick-card" onClick={() => actions.setStudio("notation")}>
            <span className="quick-card__icon">
              <Sigma size={16} />
            </span>
            <span className="quick-card__title">
              符号百科 <ArrowRight size={12} />
            </span>
            <span className="quick-card__desc">同一函数的五种学科写法，以及八个逻辑门的标准符号。</span>
          </button>
          <button type="button" className="quick-card" onClick={() => actions.setStudio("probability")}>
            <span className="quick-card__icon">
              <Dice5 size={16} />
            </span>
            <span className="quick-card__title">
              概率实验室 <ArrowRight size={12} />
            </span>
            <span className="quick-card__desc">设置输入概率，比较理论值与十万次蒙特卡洛模拟。</span>
          </button>
        </div>

        <div className="grid-2" style={{ marginTop: 14, alignItems: "start" }}>
          <Panel title="示例实验" sub="点击加载并进入卡诺图">
            <div className="stack" style={{ gap: 2 }}>
              {EXAMPLES.map((example) => (
                <button
                  key={example.expr}
                  type="button"
                  className="example-row"
                  onClick={() => load(example.expr)}
                >
                  <span className="example-row__expr">{example.expr}</span>
                  <span className="example-row__goal">{example.goal}</span>
                </button>
              ))}
            </div>
          </Panel>

          <div className="stack" style={{ gap: 14 }}>
            <Panel title="当前函数" actions={<Badge tone="accent">{state.fn.variables.join("") || "常量"}</Badge>}>
              <div className="code-block" style={{ marginBottom: 8 }}>
                {state.fn.expression}
              </div>
              <div className="stat-grid">
                <Stat label="变量数" value={state.fn.variables.length} />
                <Stat label="最小项" value={mintermList(state.fn).length} />
                <Stat label="最简项数" value={sop?.termCount ?? 0} />
                <Stat label="文字数" value={sop?.literalCount ?? 0} />
              </div>
              <div className="row" style={{ marginTop: 8, gap: 6 }}>
                <span className="tiny dim">{mintermNotation(state.fn)}</span>
              </div>
              <div className="formula" style={{ marginTop: 6 }}>
                F = {sop?.expression ?? state.fn.expression}
              </div>
            </Panel>

            <Panel title="最近使用" actions={<Badge tone="mute">{state.recentExpressions.length}</Badge>}>
              {state.recentExpressions.length === 0 ? (
                <div className="empty" style={{ padding: 12 }}>
                  还没有历史记录。输入一个表达式后会自动出现在这里。
                </div>
              ) : (
                <div className="stack" style={{ gap: 3 }}>
                  {state.recentExpressions.map((expr) => (
                    <button
                      key={expr}
                      type="button"
                      className="example-row"
                      onClick={() => actions.applyExpression(expr)}
                    >
                      <span className="example-row__expr">{expr}</span>
                    </button>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>

        <div className="grid-2" style={{ marginTop: 14, alignItems: "start" }}>
          <Panel title="三门课程的关系" sub="结构对应，而非牵强类比">
            <MiniBridge />
          </Panel>

          <Panel
            title="本地数据"
            actions={
              <Badge tone="ok">
                <ShieldCheck size={11} /> 仅本机
              </Badge>
            }
          >
            <div className="small muted" style={{ marginBottom: 10, lineHeight: 1.7 }}>
              所有状态保存在浏览器的 localStorage 中，不上传任何服务器，也不需要账号或网络。
              {lastSavedAt
                ? ` 最近一次保存：${new Date(lastSavedAt).toLocaleTimeString("zh-CN", { hour12: false })}`
                : " 当前尚未写入。"}
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              <Button size="sm" icon={<Download size={12} />} onClick={exportJson}>
                导出 JSON
              </Button>
              <Button size="sm" icon={<Upload size={12} />} onClick={() => fileRef.current?.click()}>
                导入 JSON
              </Button>
              <Button size="sm" variant="ghost" onClick={actions.resetExperiment}>
                恢复默认示例
              </Button>
              <Button size="sm" variant="danger" icon={<Trash2 size={12} />} onClick={() => setPendingClear(true)}>
                清除本地数据
              </Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importJson(file);
                event.target.value = "";
              }}
            />

            {pendingClear && (
              <Callout tone="danger">
                <strong>这会清除表达式、概率设置、手动分组与历史记录，且无法撤销。</strong>
                <div className="row" style={{ gap: 6, marginTop: 8 }}>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      actions.clearAll();
                      setPendingClear(false);
                    }}
                  >
                    确认清除
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPendingClear(false)}>
                    取消
                  </Button>
                </div>
              </Callout>
            )}

            <div className="divider" style={{ margin: "10px 0" }} />
            <div className="tiny dim">
              导入会先完整校验结构（版本、变量名、输出向量长度、分组编号范围），
              校验不通过时不会改动现有数据。
            </div>
          </Panel>
        </div>
      </main>

      <aside className="inspector" aria-label="实验状态">
        <Panel title="实验状态" actions={<span className="dot" />}>
          <div className="stack" style={{ gap: 8 }}>
            <div className="row-between">
              <span className="small muted">工作台</span>
              <span className="small">
                {ROUTES.find((route) => route.key === state.studio)?.zh ?? state.studio}
              </span>
            </div>
            <div className="row-between">
              <span className="small muted">主题</span>
              <span className="small">{state.theme === "dark" ? "深色" : "浅色"}</span>
            </div>
            <div className="row-between">
              <span className="small muted">模拟次数</span>
              <span className="mono small">{state.trials.toLocaleString()}</span>
            </div>
            <div className="row-between">
              <span className="small muted">手动分组</span>
              <span className="mono small">{state.manual.groups.length}</span>
            </div>
          </div>
        </Panel>

        <Panel title="建议的第一次实验">
          <ol className="stack" style={{ gap: 8 }}>
            <li className="small muted">1. 在卡诺图工作室输入 F = (A &amp; B) | C，看自动分组。</li>
            <li className="small muted">2. 切到手动分组，自己圈出 C 的四个格子。</li>
            <li className="small muted">3. 把 m6 改成 0，观察 C + A·B 如何退化成 C。</li>
            <li className="small muted">4. 去概率实验室，把 P(C) 调到 0，看输出概率。</li>
          </ol>
        </Panel>

        <Panel title="快捷键">
          <div className="stack" style={{ gap: 6 }}>
            {[
              { keys: "Alt + 1…9 / 0", desc: "切换工作台" },
              { keys: "Esc", desc: "关闭提示" },
            ].map((row) => (
              <div className="row-between" key={row.keys}>
                <span className="kbd">{row.keys}</span>
                <span className="tiny dim">{row.desc}</span>
              </div>
            ))}
          </div>
        </Panel>
      </aside>
    </>
  );
}
