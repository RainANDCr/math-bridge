/**
 * 跨学科概念数据
 *
 * 原则：只写数学结构上确实存在的对应关系。
 * 例如「合取 ↔ 交集 ↔ AND」是同一套格（lattice）运算；
 * 但「所有事件都必须独立」是错误类比，这里不会这么写。
 */

export type Domain = "离散数学" | "概率论" | "数字电路";

export interface Concept {
  id: string;
  zh: string;
  en: string;
  domain: Domain | "公共";
  /** 一句话定义 */
  definition: string;
  /** 形式化表达 */
  formula: string;
  /** 直观解释 */
  intuition: string;
  /** 在其他课程中的对应知识 */
  cross: Array<{ domain: Domain; text: string }>;
  /** 可以立刻做的小实验 */
  experiment: string;
  /** 常见误区 */
  misconceptions: string[];
}

export const CONCEPTS: Concept[] = [
  {
    id: "proposition",
    zh: "命题",
    en: "Proposition",
    domain: "离散数学",
    definition: "能判断真假的陈述句。在布尔函数中，一个变量 A 就是取值为 真 / 假 的命题。",
    formula: "A ∈ {0, 1}",
    intuition: "“今天下雨”是一个命题，它要么真要么假；把三个这样的命题组合起来，就得到一张真值表。",
    cross: [
      { domain: "数字电路", text: "对应一根输入导线的高低电平：1 表示高电平，0 表示低电平。" },
      { domain: "概率论", text: "对应一个事件：P(A) 就是“A 为真”这件事发生的概率。" },
    ],
    experiment: "在逻辑工作台输入 F = A，观察真值表中输出与 A 完全一致。",
    misconceptions: [
      "把变量当成“可以取任意值”的普通代数变量：布尔变量只有两个取值，且运算规则不同。",
      "以为 1 一定表示“真”的物理含义，其实它只是约定的一种编码。",
    ],
  },
  {
    id: "conjunction",
    zh: "合取",
    en: "Conjunction (AND)",
    domain: "离散数学",
    definition: "两个命题都为真时结果才为真。",
    formula: "A ∧ B = 1 ⇔ A = 1 且 B = 1",
    intuition: "“既下雨又刮风”只有在两件事同时发生时才是真的。",
    cross: [
      { domain: "数字电路", text: "与门（AND gate）：所有输入为高，输出才为高。" },
      { domain: "概率论", text: "对应事件交集 A ∩ B；只有在独立时才有 P(A∩B)=P(A)P(B)。" },
    ],
    experiment: "输入 F = A·B，在卡诺图上只应命中一个格子（AB=11）。",
    misconceptions: [
      "默认 P(A∩B) = P(A)P(B)：这个等式只在独立时成立，一般情况要用 P(A∩B)=P(A)P(B|A)。",
    ],
  },
  {
    id: "disjunction",
    zh: "析取",
    en: "Disjunction (OR)",
    domain: "离散数学",
    definition: "两个命题至少有一个为真时结果为真。",
    formula: "A ∨ B = 1 ⇔ A = 1 或 B = 1（可同时为真）",
    intuition: "“下雨或刮风”只要有一件发生就算成立，这里是包含或，不是二选一。",
    cross: [
      { domain: "数字电路", text: "或门（OR gate）：任一输入为高，输出即为高。" },
      { domain: "概率论", text: "对应事件并集 A ∪ B，且 P(A∪B)=P(A)+P(B)−P(A∩B)。" },
    ],
    experiment: "输入 F = A | B，观察卡诺图上三个格子连成一个 L 形分组。",
    misconceptions: ["把“或”理解成排他或（XOR），从而算错概率。"],
  },
  {
    id: "negation",
    zh: "否定",
    en: "Negation (NOT)",
    domain: "离散数学",
    definition: "把真变假、假变真。",
    formula: "¬A = 1 ⇔ A = 0",
    intuition: "“不下雨”就是“下雨”的反面。",
    cross: [
      { domain: "数字电路", text: "非门（NOT gate / inverter）：输出与输入反相。" },
      { domain: "概率论", text: "对应补集 Aᶜ，且 P(Aᶜ) = 1 − P(A)。" },
    ],
    experiment: "输入 F = !A，卡诺图会覆盖 A=0 的两格，化简结果为 ¬A。",
    misconceptions: ["把 ¬(A∧B) 直接写成 ¬A∧¬B：正确结果是 ¬A∨¬B（德摩根律）。"],
  },
  {
    id: "truth-table",
    zh: "真值表",
    en: "Truth Table",
    domain: "公共",
    definition: "穷举所有输入组合并列出对应输出，是布尔函数的完整定义。",
    formula: "n 个变量 → 2ⁿ 行",
    intuition: "它是函数的“身份证”：两张真值表完全相同，就说明是同一个函数。",
    cross: [
      { domain: "数字电路", text: "电路的输入输出表，是验证电路功能的标准依据。" },
      { domain: "概率论", text: "每一行是一个基本结果，行的概率相加得到事件概率。" },
    ],
    experiment: "在真值表里改一个输出值，看化简结果如何变化。",
    misconceptions: ["以为表达式不同就是不同函数：A·B + A·¬B 与 A 的真值表完全一样。"],
  },
  {
    id: "boolean-algebra",
    zh: "布尔代数",
    en: "Boolean Algebra",
    domain: "离散数学",
    definition: "以 0/1 为元素、以与或非为运算的代数系统，满足交换、结合、分配、吸收等律。",
    formula: "A + A·B = A　（吸收律）",
    intuition: "化简不是“碰运气”，每一步都可以引用一条代数律来证明。",
    cross: [
      { domain: "数字电路", text: "逻辑函数化简：用更少的门实现同一功能，降低成本与延迟。" },
      { domain: "概率论", text: "事件集合运算（交、并、补）满足同一套分配律与德摩根律。" },
    ],
    experiment: "比较 F = (A&B) | (A&!B) 与 F = A 的真值表，验证吸收律。",
    misconceptions: ["把普通代数的 A + A = 2A 搬过来：布尔代数里 A + A = A。"],
  },
  {
    id: "minterm",
    zh: "最小项",
    en: "Minterm",
    domain: "数字电路",
    definition: "包含全部变量、每个变量以原变量或反变量出现一次，且只在一个输入组合上取 1 的乘积项。",
    formula: "mᵢ 对应使函数在该行唯一的输入组合",
    intuition: "最小项是卡诺图上的一个格子，编号就是该行输入的二进制值。",
    cross: [
      { domain: "离散数学", text: "对应真值表中一行的“完整描述”：n 个文字的合取。" },
      { domain: "概率论", text: "对应一个基本事件，所有最小项的概率之和为 1。" },
    ],
    experiment: "在卡诺图界面输入 Σm(1,3,5,7)，观察它对应四个格子并化简为 C。",
    misconceptions: [
      "编号顺序搞反：本项目约定 A 为最高位，m₅ = 101 表示 A=1,B=0,C=1。",
    ],
  },
  {
    id: "karnaugh",
    zh: "卡诺图",
    en: "Karnaugh Map",
    domain: "数字电路",
    definition: "把真值表重排成格雷码形式的方格图，使几何相邻与逻辑相邻一一对应。",
    formula: "相邻 ⇔ 两个最小项只差一个变量",
    intuition: "图上挨着的两格可以合并消去一个变量；四角在逻辑上也是挨着的。",
    cross: [
      { domain: "离散数学", text: "本质是布尔代数的图形式化简，每一步合并都对应一条 A + ¬A = 1。" },
      { domain: "概率论", text: "分组的大小反映该蕴含项覆盖了多少个基本事件。" },
    ],
    experiment: "输入 Σm(0,2,8,10)（四变量），观察四角如何合成一个 4 格分组 ¬B·¬D。",
    misconceptions: [
      "用普通二进制顺序填表：必须使用 00, 01, 11, 10 的格雷码顺序。",
      "以为对角线也算相邻：对角格差两位，不能合并。",
    ],
  },
  {
    id: "dont-care",
    zh: "无关项",
    en: "Don't Care",
    domain: "数字电路",
    definition: "在某些输入组合下输出值不被约束，可以当作 0 也可以当作 1 来帮助化简。",
    formula: "X ∈ {0, 1}（由设计者选择）",
    intuition: "既然这些输入不会出现，就可以“顺手”把它们圈进分组，让表达式更简单。",
    cross: [
      { domain: "离散数学", text: "相当于一个部分函数：在这些点上不定义，允许任意延拓。" },
      { domain: "概率论", text: "输出概率因此不是一个定值，而是一个区间。" },
    ],
    experiment: "输入 Σm(0,1,2)，再把 m3 标记为 X，观察两变量函数如何被化简成常量 1。",
    misconceptions: ["以为无关项必须被覆盖：无关项可以不圈，只是“可圈”。"],
  },
  {
    id: "static-hazard",
    zh: "静态冒险",
    en: "Static Hazard",
    domain: "数字电路",
    definition:
      "输入只变一位、输出本应保持不变时，却因为交接空隙出现一个窄脉冲。两个相邻的 1 格被不同的项覆盖时就会发生。",
    formula: "AB + A′C，在 B = C = 1 时改 A —— 输出应恒为 1",
    intuition: "前一项已经失效、后一项还没建立，中间那一小段时间里两项都是 0，输出就掉下去了。",
    cross: [
      { domain: "离散数学", text: "两个乘积项各覆盖了相邻最小项中的一个，却没有一项同时覆盖这两个。" },
      { domain: "数字电路", text: "补上共识项 BC 后整式仍然等价 —— 等价的式子，切换瞬间的表现可以不同。" },
    ],
    experiment: "卡诺图工作室输入 F = AB + A′C，打开冒险分析，看那一对相邻 1 格为什么被判为危险。",
    misconceptions: [
      "以为最简式就是最好的电路：最简与无冒险是两个目标，加一项才堵住这个洞。",
      "以为理想仿真能看出来：等延迟的仿真里不会出现这个脉冲，它来自两条路径的延迟差。",
    ],
  },
  {
    id: "consensus",
    zh: "冗余项",
    en: "Consensus Term",
    domain: "离散数学",
    definition:
      "AB + A′C 里的 BC：它只可能在 B = C = 1 时为 1，而此时无论 A 取什么，前两项已有一个为 1 —— 所以删掉它不改变函数值。",
    formula: "AB + A′C = AB + A′C + BC",
    intuition: "代数上多余，覆盖上可能必需，时序上往往正是它堵住了冒险的洞。",
    cross: [
      { domain: "数字电路", text: "加共识项是静态冒险的标准修复手段。" },
      { domain: "概率论", text: "加入一个被蕴含的事件不改变并集，概率自然不变。" },
    ],
    experiment: "逻辑工作台 → 冗余项与布尔除法：看哪一项被标为可删，以及删掉后少几个文字。",
    misconceptions: [
      "以为「冗余」等于「没用」：覆盖上必需、代数上多余、时序上必要，是三件事。",
      "以为布尔除法能提出所有公因子：代数因式分解提不出 (A+C)，那要交无关项来换。",
    ],
  },
  {
    id: "state-machine",
    zh: "状态机",
    en: "State Machine",
    domain: "数字电路",
    definition: "用「当前状态 + 当前输入」决定「次态 + 输出」的模型。它的全部行为就是一张状态转移表。",
    formula: "δ: S × X → S，Z: S × X → Z（Mealy）",
    intuition: "一把只有有限档位的旋钮：下一档只取决于现在在哪一档、以及按了哪个键。",
    cross: [
      { domain: "离散数学", text: "就是状态集合上的一个函数；状态图是它的有向图。" },
      { domain: "概率论", text: "马尔可夫链结构相同，区别只在转移是概率分布而不是确定值。" },
    ],
    experiment: "时序逻辑：改一个转移，状态图、次态方程与卡诺图会同时变。",
    misconceptions: [
      "把状态当成「记忆的全部内容」而不是「有限的几个等价类」。",
      "以为 Mealy 与 Moore 只差画法：差别在输出是否依赖输入 —— 同一状态在不同输入下输出可以不同。",
    ],
  },
  {
    id: "state-encoding",
    zh: "状态编码",
    en: "State Encoding",
    domain: "数字电路",
    definition:
      "把 n 个抽象状态映射成码字的方式。二进制要 ⌈log₂n⌉ 位，one-hot 要 n 位。",
    formula: "3 状态：二进制 2 位（有一个码空着）／one-hot 3 位（每态一位）",
    intuition: "同一台机器，换个编码，触发器数、门数、甚至抗偏斜能力都会变。",
    cross: [
      { domain: "离散数学", text: "编码是一个单射 f: S → {0,1}ᵏ，没被用到的码字就是无关项。" },
      { domain: "概率论", text: "无直接对应：编码是结构选择，不是概率模型。" },
    ],
    experiment: "时序逻辑 → 编码：同一台机器在二进制与 one-hot 下的方程与代价并排看。",
    misconceptions: [
      "以为状态数减少就一定省触发器：4→3 在二进制下位宽仍是 2 位。",
      "以为 one-hot 一定更费：它的 D_i 直接是若干转移之和，方程往往更浅。",
    ],
  },
  {
    id: "flip-flop",
    zh: "触发器",
    en: "Flip-Flop",
    domain: "数字电路",
    definition: "在时钟沿把输入记住的一位存储元件。D 型记「次态是什么」，JK 记「该置位、复位、翻转还是保持」。",
    formula: "D：Q⁺ = D；JK：Q⁺ = J·Q′ + K′·Q",
    intuition: "D 是直接告诉它下一步是什么；JK 是告诉它该怎么变 —— 同样一台机器，两种说法。",
    cross: [
      { domain: "离散数学", text: "D 触发器就是延迟一拍的恒等映射。" },
      { domain: "概率论", text: "无直接对应：它是时序元件，不是事件结构。" },
    ],
    experiment: "时序逻辑：切换 D / JK，看激励表的无关项怎样进入化简。",
    misconceptions: [
      "以为 JK 比 D「更强」：两种都能实现同一台机器，JK 只是把次态信息重新编码成激励。",
      "以为激励方程等于次态方程：激励是「怎么变」，次态是「变成什么」，前者需要查表反推。",
    ],
  },
  {
    id: "equivalent-state",
    zh: "等价状态",
    en: "Equivalent States",
    domain: "数字电路",
    definition: "两个状态如果对任何输入序列都给出相同输出，就无法从外部区分，可以合并。",
    formula: "Z(s, x) = Z(t, x) 且 δ(s, x) ≡ δ(t, x)（对全部输入 x）",
    intuition: "两个抽屉里的东西永远一模一样，那就没必要留两个抽屉。",
    cross: [
      { domain: "离散数学", text: "等价关系（自反、对称、传递）；商集就是化简后的状态集。" },
      { domain: "概率论", text: "无直接对应。" },
    ],
    experiment: "时序逻辑 → 状态化简：看第几轮因为哪一位输入把哪个块拆开。",
    misconceptions: [
      "以为输出相同就能合并：还要看次态是否落进同一块（这就是划分细化要做的事）。",
      "把不可达状态当作无关项：不可达 ≠ 无关项，它在表里必须有定义的次态。",
    ],
  },
  {
    id: "race",
    zh: "竞争",
    en: "Race Condition",
    domain: "数字电路",
    definition:
      "一次转移有两位以上同时变化时，各位到达有先后，电路可能按「部分已更新的状态」去算次态。",
    formula: "中间码 t：若 δ(t, x) ≠ δ(s, x)，就是临界竞争",
    intuition: "两个人同时改一个字，谁先落笔决定了别人看到的是半成品还是成品。",
    cross: [
      { domain: "离散数学", text: "中间码落在状态集合之外，在状态图里可能根本没有定义。" },
      { domain: "数字电路", text: "改编码（例如用格雷码）让相邻状态只差一位，就能从源头上消掉竞争。" },
    ],
    experiment: "时序逻辑 → 竞争分析：同一台机器换编码后，临界 / 非临界会不会翻转。",
    misconceptions: [
      "以为同步电路也有竞争：理想同步下所有位同时更新，本没有竞争 —— 问题出在偏斜。",
      "以为有竞争就一定出错：非临界竞争会被下一次转移拉回目标状态。",
    ],
  },
  {
    id: "clock-skew",
    zh: "时钟偏斜",
    en: "Clock Skew",
    domain: "数字电路",
    definition: "同一个时钟沿到达各触发器的时间不一致。后采样的那一位可能看到「部分位已更新」的状态。",
    formula: "不出错的条件：δ < t_cq + t_path（被改位 → 该 D 端）",
    intuition: "偏斜小于「信号传到 D 端所需的时间」时，晚采样采到的仍是旧值 —— 逻辑越浅越抗偏斜。",
    cross: [
      { domain: "离散数学", text: "无直接对应：这是时间性质，不是逻辑性质。" },
      { domain: "数字电路", text: "同源的另一个约束是建立时间：时钟周期必须长于最慢路径加上建立时间。" },
    ],
    experiment: "时序逻辑 → 偏斜裕量：拖动偏斜，看采样点从不跳变变成正好落在跳变上。",
    misconceptions: [
      "以为偏斜只是让电路变慢：它不改变逻辑，却会因为采样落在跳变上而改变结果。",
      "以为仿真能直接判定亚稳态：等延迟模型只能指出「采样落在跳变上」，真实器件那里是一段有限宽度的窗口。",
    ],
  },
  {
    id: "event",
    zh: "事件",
    en: "Event",
    domain: "概率论",
    definition: "样本空间的子集；在布尔视角下就是一个取值为 0/1 的命题。",
    formula: "P(A) = Σ_{ω ∈ A} P(ω)",
    intuition: "“输出 F=1”本身就是一个事件，它的概率等于所有让 F=1 的输入组合的概率之和。",
    cross: [
      { domain: "离散数学", text: "对应命题；事件的交、并、补对应合取、析取、否定。" },
      { domain: "数字电路", text: "对应电路输出为高的那些输入组合集合。" },
    ],
    experiment: "在概率实验室把所有输入概率设为 0.5，验证 P(F=1) 是否等于 1 的格数 / 2ⁿ。",
    misconceptions: ["把概率当作“格子占比”只在均匀分布时成立；输入不等概时要用加权求和。"],
  },
  {
    id: "independence",
    zh: "独立性",
    en: "Independence",
    domain: "概率论",
    definition: "P(A∩B) = P(A)P(B)。只有独立时，联合概率才能拆成边缘概率相乘。",
    formula: "P(A∩B) = P(A)·P(B) ⇔ A 与 B 独立",
    intuition: "独立意味着知道 A 发生与否，不会改变 B 的概率。",
    cross: [
      { domain: "数字电路", text: "输入信号互不影响，是概率分析里最常用的建模假设。" },
      { domain: "离散数学", text: "独立不是逻辑蕴含关系，而是概率测度上的性质。" },
    ],
    experiment: "把 P(A) 调到 1，观察输出概率如何被“锁死”。",
    misconceptions: [
      "互斥与独立混淆：互斥事件（不能同时发生）通常是不独立的。",
      "没有声明独立就直接把概率相乘。",
    ],
  },
  {
    id: "joint-distribution",
    zh: "联合分布",
    en: "Joint Distribution",
    domain: "概率论",
    definition:
      "同时给出所有输入组合的概率。它比每个变量各自的边缘概率携带更多信息 —— 相关性就藏在这里。",
    formula: "独立时才有 P(A∩B) = P(A)·P(B)",
    intuition: "两个变量各自的概率相同，不代表它们一起出现的概率相同：A 和 B 可能总是一起发生。",
    cross: [
      { domain: "离散数学", text: "联合分布是定义在 2ⁿ 个输入组合上的一个函数，边缘概率由它求和得到。" },
      { domain: "数字电路", text: "对应「输入不是各自独立翻转」的情形，例如多个输入由同一个信号派生。" },
    ],
    experiment: "概率实验室 → 输入相关性：保持边缘概率不变，只改相关性，看 P(F=1) 会不会变。",
    misconceptions: [
      "以为知道每个输入的概率就知道了全部：边缘概率推不出相关性。",
      "以为相关就意味着因果：联合分布只描述同时发生的倾向，不指明谁导致谁。",
    ],
  },
  {
    id: "monte-carlo",
    zh: "蒙特卡洛方法",
    en: "Monte Carlo Method",
    domain: "概率论",
    definition: "用大量随机抽样逼近一个难以解析计算的量，用频率估计概率。",
    formula: "频率 → P(F=1)　（大数定律）",
    intuition: "掷一万次骰子，出现 6 的频率会靠近 1/6，但不是精确等于。",
    cross: [
      { domain: "数字电路", text: "可用于估计电路输出的翻转率与功耗。" },
      { domain: "离散数学", text: "抽样过程本身可以用逻辑条件描述：命中即 F(x)=1。" },
    ],
    experiment: "固定种子跑 100 次与 100000 次，比较误差的变化。",
    misconceptions: [
      "以为模拟次数越多结果一定越准：期望误差按 1/√n 下降，且仍有随机波动。",
    ],
  },
  {
    id: "subexpression",
    zh: "子表达式共享",
    en: "Common Subexpression",
    domain: "数字电路",
    definition: "多个输出里相同的乘积项或公因子只做一次，把结果接到每个需要它的输出上。",
    formula: "F₁ = AB + AC = A(B + C)，F₂ = AB + D —— 共用 T₁ = A·B",
    intuition: "两个函数都要算 A·B，就没必要做两个与门。",
    cross: [
      { domain: "离散数学", text: "分配律的逆用：把公共因子提出来，等价性与原式保持一致。" },
      { domain: "概率论", text: "无直接对应。" },
    ],
    experiment: "多输出化简 → 子表达式共享：看 T₁、T₂ 的定义序列，以及总代价怎么变。",
    misconceptions: [
      "以为共享一定更好：共享引入额外的扇出，代价表里的门数与连线数要一起看。",
      "以为门少就等于快：两级变多级，延迟可能反而变长。",
    ],
  },
];

export interface Relation {
  from: string;
  to: string;
  label: string;
  /** 结构对应的强度：exact 表示同一数学结构，analogy 表示类比 */
  strength: "exact" | "analogy";
}

export const RELATIONS: Relation[] = [
  { from: "conjunction", to: "event", label: "合取 ↔ 事件交集", strength: "exact" },
  { from: "disjunction", to: "event", label: "析取 ↔ 事件并集", strength: "exact" },
  { from: "negation", to: "event", label: "否定 ↔ 事件补集", strength: "exact" },
  { from: "proposition", to: "truth-table", label: "命题取值 → 真值表行", strength: "exact" },
  { from: "truth-table", to: "karnaugh", label: "真值表重排为格雷码方格", strength: "exact" },
  { from: "karnaugh", to: "boolean-algebra", label: "几何分组 ↔ 代数化简", strength: "exact" },
  { from: "minterm", to: "karnaugh", label: "最小项 ↔ 卡诺图格子", strength: "exact" },
  { from: "dont-care", to: "boolean-algebra", label: "无关项扩大化简空间", strength: "exact" },
  { from: "event", to: "monte-carlo", label: "概率 ↔ 频率", strength: "exact" },
  { from: "independence", to: "monte-carlo", label: "独立抽样假设", strength: "exact" },
  { from: "proposition", to: "event", label: "命题 ↔ 事件", strength: "exact" },
  { from: "boolean-algebra", to: "event", label: "布尔代数 ↔ 集合代数", strength: "exact" },
  { from: "karnaugh", to: "static-hazard", label: "相邻格被不同项覆盖", strength: "exact" },
  { from: "static-hazard", to: "consensus", label: "共识项堵住交接空隙", strength: "exact" },
  { from: "consensus", to: "boolean-algebra", label: "等价但不多余", strength: "exact" },
  { from: "state-machine", to: "flip-flop", label: "状态位由触发器保存", strength: "exact" },
  { from: "state-machine", to: "equivalent-state", label: "状态集合的等价类", strength: "exact" },
  { from: "equivalent-state", to: "state-encoding", label: "先合并再编码", strength: "exact" },
  { from: "state-encoding", to: "race", label: "换编码可从源头消竞争", strength: "exact" },
  { from: "race", to: "clock-skew", label: "可能 → 多少单位之后", strength: "exact" },
  { from: "independence", to: "joint-distribution", label: "独立是联合的特例", strength: "exact" },
  { from: "joint-distribution", to: "event", label: "组合概率由联合分布给出", strength: "exact" },
  { from: "subexpression", to: "boolean-algebra", label: "分配律的逆用", strength: "exact" },
];

export function conceptById(id: string): Concept | undefined {
  return CONCEPTS.find((concept) => concept.id === id);
}

export function relationsOf(id: string): Relation[] {
  return RELATIONS.filter((r) => r.from === id || r.to === id);
}
