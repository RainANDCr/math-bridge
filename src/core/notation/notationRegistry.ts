import type { GateKind } from "../logic-gates/gates";
import type { Discipline } from "./notationTypes";

/**
 * 运算符号注册表
 *
 * 这里是「符号百科」的唯一数据源，也是详情面板、搜索、复制的数据源。
 * 每条记录都必须说明：同一结构在不同学科里怎么写、为什么这样写、哪里容易混。
 *
 * 一条硬规矩：不适用就写 null，界面显示「无直接对应」，
 * 不允许为了表格好看而编造对应关系。
 */

export type OperatorId = "and" | "or" | "not" | "xor" | "xnor" | "nand" | "nor" | "buffer";

export type StudioTarget = "logic" | "karnaugh" | "multi" | "sequential" | "gate" | "probability" | "connection";

export interface NotationVariant {
  /** 该学科里常见的写法，可能不止一种 */
  forms: string[];
  /** 规范写法（教材首选），用于大字号展示 */
  primary: string;
  /** primary 是否需要整体加上划线（数字电路的取反记号） */
  barred?: boolean;
  /** 为什么这样写 / 适用条件 */
  note: string;
}

export interface OperatorEntry {
  id: OperatorId;
  zh: string;
  en: string;
  /** 卡片左上角的字标；复合运算没有单字符符号时用最简定义式 */
  glyph: string;
  /** 可复制的单字符符号 */
  symbols: string[];
  /** 搜索同义词（中英文、符号、口语说法） */
  keywords: string[];
  summary: string;
  definition: string;
  variants: Record<Discipline, NotationVariant | null>;
  gate: GateKind;
  arity: 1 | 2;
  example: { text: string; explain: string };
  confusions: string[];
  studio: { target: StudioTarget; label: string } | null;
}

export const OPERATORS: OperatorEntry[] = [
  {
    id: "and",
    glyph: "∧",
    zh: "逻辑与（合取）",
    en: "AND / Conjunction",
    symbols: ["∧", "·", "&", "∩", "*"],
    keywords: [
      "与", "并且", "同时", "都", "合取", "交集", "同时发生", "and", "conjunction",
      "intersection", "∧", "·", "&", "∩", "AB", "串联", "都成立", "全部为真",
    ],
    summary: "所有操作数都为真（1）时，结果才为真",
    definition: "A ∧ B 为真，当且仅当 A 与 B 都真。它是「全部满足」的结构。",
    variants: {
      discrete: {
        forms: ["A ∧ B"],
        primary: "A ∧ B",
        note: "命题逻辑的合取联结词，含义由真值表唯一确定。",
      },
      digital: {
        forms: ["A·B", "AB", "Y = A·B"],
        primary: "A·B",
        note: "由与门实现。这里的 · 是布尔乘：1·1 = 1，但它不是算术乘法。",
      },
      boolean: {
        forms: ["AB", "A·B"],
        primary: "AB",
        note: "相邻文字表示相乘，是最常见的代数写法；乘号常被省略。",
      },
      set: {
        forms: ["A ∩ B"],
        primary: "A ∩ B",
        note: "交集：同时属于 A 和 B 的元素。与逻辑与结构对应，但对象是集合。",
      },
      probability: {
        forms: ["P(A ∩ B)", "P(AB)"],
        primary: "P(A ∩ B)",
        note: "两事件同时发生的概率。只有 A、B 独立时才有 P(A∩B) = P(A)P(B)。",
      },
    },
    gate: "AND",
    arity: 2,
    example: {
      text: "F = A·B",
      explain: "两个开关串联：只有 A、B 都闭合，灯才亮。真值表里只有 (1,1) 这一行输出 1。",
    },
    confusions: [
      "与不是算术乘法：布尔代数里 1·1 = 1，但 1 + 1 也等于 1。",
      "P(A∩B) ≠ P(A)·P(B)，除非已知 A、B 独立。",
      "A·B′ 表示 A 与（非 B），不是 (A·B)′；撇号只作用于紧邻的变量。",
    ],
    studio: { target: "logic", label: "去逻辑工作台看真值表" },
  },
  {
    id: "or",
    glyph: "∨",
    zh: "逻辑或（析取）",
    en: "OR / Disjunction",
    symbols: ["∨", "+", "|", "∪"],
    keywords: [
      "或", "或者", "至少一个", "析取", "并集", "or", "disjunction", "union",
      "∨", "+", "|", "∪", "并联", "至少一个成立",
    ],
    summary: "任一操作数为真（1）时，结果为真",
    definition: "A ∨ B 为假，当且仅当 A 与 B 都假。注意这里是「可兼或」。",
    variants: {
      discrete: {
        forms: ["A ∨ B"],
        primary: "A ∨ B",
        note: "命题逻辑的析取联结词；日常语言的「或」有时排斥、有时不排斥，这里取可兼或。",
      },
      digital: {
        forms: ["A + B", "Y = A + B"],
        primary: "A + B",
        note: "由或门实现。布尔加：1 + 1 = 1，不是算术加法。",
      },
      boolean: {
        forms: ["A + B"],
        primary: "A + B",
        note: "格运算中的「并」，满足幂等律 A + A = A。",
      },
      set: {
        forms: ["A ∪ B"],
        primary: "A ∪ B",
        note: "并集：属于 A 或属于 B（或两者）的元素。",
      },
      probability: {
        forms: ["P(A ∪ B)"],
        primary: "P(A ∪ B)",
        note: "至少一个事件发生的概率；一般用容斥公式，不能直接把概率相加。",
      },
    },
    gate: "OR",
    arity: 2,
    example: {
      text: "F = A + B",
      explain: "两个开关并联：任意一个闭合，灯就亮。真值表里 (0,0) 那一行才输出 0。",
    },
    confusions: [
      "这里是可兼或：A、B 同时为真时结果仍为真，这一点与异或不同。",
      "P(A∪B) = P(A) + P(B) − P(A∩B)；只有互斥时才能直接相加。",
      "1 + 1 = 1；看到 + 不要按算术相加。",
    ],
    studio: { target: "logic", label: "去逻辑工作台看真值表" },
  },
  {
    id: "not",
    glyph: "¬",
    zh: "逻辑非（否定 / 取反）",
    en: "NOT / Negation / Complement",
    symbols: ["¬", "!", "~", "′", "ᶜ"],
    keywords: [
      "非", "取反", "否定", "反相", "补", "补集", "not", "negation", "complement",
      "inverter", "¬", "!", "~", "'", "上划线", "反相器",
    ],
    summary: "把 0 变 1、1 变 0",
    definition: "¬A 为真当且仅当 A 为假。它是唯一的一元布尔运算。",
    variants: {
      discrete: {
        forms: ["¬A", "~A"],
        primary: "¬A",
        note: "命题的否定。¬ 只作用于紧跟其后的一个操作数。",
      },
      digital: {
        forms: ["A̅", "Y = A̅"],
        primary: "A",
        barred: true,
        note: "上划线覆盖到哪里，取反就作用到哪里：横线盖住整个 A·B 与只盖住 A，是两个不同的函数。",
      },
      boolean: {
        forms: ["A′", "A̅"],
        primary: "A′",
        note: "补元：A + A′ = 1，A·A′ = 0。",
      },
      set: {
        forms: ["Aᶜ", "U \\ A"],
        primary: "Aᶜ",
        note: "相对于全集 U 的补集：不属于 A 的元素。",
      },
      probability: {
        forms: ["P(Aᶜ)", "1 − P(A)"],
        primary: "P(Aᶜ) = 1 − P(A)",
        note: "对立事件。这一条不需要独立性，对任意事件都成立。",
      },
    },
    gate: "NOT",
    arity: 1,
    example: {
      text: "F = A′",
      explain: "反相器：输入 1 输出 0，输入 0 输出 1。真值表只有两行。",
    },
    confusions: [
      "上划线的范围由横线长度决定：整条横线盖住 A·B 表示 ¬(A·B)，只盖住 A 表示 (¬A)·B。",
      "¬(A·B) = ¬A + ¬B（德摩根），不是 ¬A·¬B。",
      "撇号只作用于紧邻的一个变量或一对括号，A·B′ ≠ (A·B)′。",
    ],
    studio: { target: "logic", label: "去逻辑工作台看反相器" },
  },
  {
    id: "xor",
    glyph: "⊕",
    zh: "异或（排斥或）",
    en: "XOR / Exclusive OR",
    symbols: ["⊕", "^", "△"],
    keywords: [
      "异或", "排斥或", "不相同", "恰有一个", "对称差", "xor", "exclusive or",
      "symmetric difference", "⊕", "^", "△", "奇校验", "不同为真", "恰有一个成立",
    ],
    summary: "两个输入不同时输出 1，相同时输出 0",
    definition: "A ⊕ B = A·B′ + A′·B。它是「恰好一个成立」，不是「至少一个成立」。",
    variants: {
      discrete: {
        forms: ["A ⊕ B"],
        primary: "A ⊕ B",
        note: "异或联结词：两者真值不同时为真。",
      },
      digital: {
        forms: ["A ⊕ B", "Y = A ⊕ B"],
        primary: "A ⊕ B",
        note: "由异或门实现；符号比或门多一条弧线，表示「只允许一个」。",
      },
      boolean: {
        forms: ["A′B + AB′", "A ⊕ B"],
        primary: "A′B + AB′",
        note: "展开成与或式后可以直接用与门、或门、非门搭出来。",
      },
      set: {
        forms: ["A △ B"],
        primary: "A △ B",
        note: "对称差：恰属于其中一个集合的元素。与异或结构对应。",
      },
      probability: {
        forms: ["P(A △ B)"],
        primary: "P(A △ B)",
        note: "恰好一个事件发生的概率；等于 P(A)+P(B)−2P(A∩B)。",
      },
    },
    gate: "XOR",
    arity: 2,
    example: {
      text: "F = A ⊕ B",
      explain: "楼梯间的双控开关：任意一个拨动都会改变灯的状态。输入相同则输出 0。",
    },
    confusions: [
      "异或不是可兼或：1 ⊕ 1 = 0，而 1 + 1 = 1。",
      "多输入异或 A⊕B⊕C 为真表示奇数个输入为真，这被用作奇校验。",
      "对称差 △ 与异或结构对应，但它是集合运算，不要与命题混为一谈。",
    ],
    studio: { target: "logic", label: "去逻辑工作台看异或门" },
  },
  {
    id: "xnor",
    glyph: "⊙",
    zh: "同或（等价）",
    en: "XNOR / Equivalence",
    symbols: ["⊙", "↔"],
    keywords: [
      "同或", "相同", "等价", "双条件", "xnor", "equivalence", "biconditional",
      "⊙", "↔", "当且仅当", "相同为真", "两者相同", "两者一致",
    ],
    summary: "两个输入相同时输出 1",
    definition: "A ⊙ B = (A ⊕ B)′ = A·B + A′·B′，也就是逻辑上的「等价」。",
    variants: {
      discrete: {
        forms: ["A ↔ B", "¬(A ⊕ B)"],
        primary: "A ↔ B",
        note: "双条件联结词：A 与 B 真值相同。",
      },
      digital: {
        forms: ["A ⊙ B", "Y = A ⊙ B"],
        primary: "A ⊙ B",
        note: "同或门 = 异或门输出端加反相圈。",
      },
      boolean: {
        forms: ["AB + A′B′", "A ⊙ B"],
        primary: "AB + A′B′",
        note: "两项分别覆盖「都为 1」和「都为 0」两种情况。",
      },
      set: {
        forms: ["(A △ B)ᶜ"],
        primary: "(A △ B)ᶜ",
        note: "对称差的补集：两个集合要么都包含、要么都不包含该元素。",
      },
      probability: {
        forms: ["P((A △ B)ᶜ)"],
        primary: "P((A △ B)ᶜ)",
        note: "两事件同时发生或同时不发生的概率；等于 1 − P(A △ B)。",
      },
    },
    gate: "XNOR",
    arity: 2,
    example: {
      text: "F = A ⊙ B",
      explain: "同或门可以当作「相等比较器」的一位：输出 1 表示两位相同。",
    },
    confusions: [
      "同或的输出端必须有反相圈；画成异或就正好相反。",
      "↔ 是双条件，不是蕴含 →：A→B 在 A=0 时恒为真，而 A↔B 不是。",
      "AB + A′B′ 与 A ⊙ B 是同一个函数，前者是展开形式。",
    ],
    studio: { target: "logic", label: "去逻辑工作台看同或门" },
  },
  {
    id: "nand",
    glyph: "(AB)′",
    zh: "与非",
    en: "NAND",
    symbols: [],
    keywords: ["与非", "nand", "通用门", "¬(A∧B)", "(AB)′", "先与后非"],
    summary: "与之后再取反：全 1 时输出 0，其余输出 1",
    definition: "A NAND B = ¬(A ∧ B)。它是通用门，单独一种就能搭出所有组合逻辑。",
    variants: {
      discrete: {
        forms: ["¬(A ∧ B)"],
        primary: "¬(A ∧ B)",
        note: "命题逻辑里就是「并非两者都真」。",
      },
      digital: {
        forms: ["(AB)′", "Y = (AB)′"],
        primary: "(A·B)",
        barred: true,
        note: "与门输出端加反相圈；横线覆盖整个乘积项。",
      },
      boolean: {
        forms: ["(AB)′"],
        primary: "(AB)′",
        note: "括号不能省：AB′ 是 A·B′，与 (AB)′ 完全不同。",
      },
      set: {
        forms: ["(A ∩ B)ᶜ"],
        primary: "(A ∩ B)ᶜ",
        note: "交集的补集；由德摩根律等于 Aᶜ ∪ Bᶜ。",
      },
      probability: {
        forms: ["P((A ∩ B)ᶜ)"],
        primary: "P((A ∩ B)ᶜ)",
        note: "两事件不同时发生的概率，等于 1 − P(A ∩ B)。",
      },
    },
    gate: "NAND",
    arity: 2,
    example: {
      text: "F = (AB)′",
      explain: "只有 A、B 同时为 1 时输出 0；其余三种输入组合都输出 1。数字电路里这条横线覆盖整个乘积项。",
    },
    confusions: [
      "¬(A·B) ≠ ¬A·¬B；后者等于 ¬(A+B)，也就是或非。",
      "与非门是通用门，但「通用」不等于「任意数量都够」：搭一个反相器就要把两个输入并在一起。",
    ],
    studio: { target: "gate", label: "去门级搭建试试只用与非门" },
  },
  {
    id: "nor",
    glyph: "(A+B)′",
    zh: "或非",
    en: "NOR",
    symbols: [],
    keywords: ["或非", "nor", "通用门", "¬(A∨B)", "(A+B)′", "先或后非"],
    summary: "或之后再取反：全 0 时输出 1，其余输出 0",
    definition: "A NOR B = ¬(A ∨ B)。它与与非门一样是通用门。",
    variants: {
      discrete: {
        forms: ["¬(A ∨ B)"],
        primary: "¬(A ∨ B)",
        note: "命题逻辑里就是「两者都不成立」。",
      },
      digital: {
        forms: ["(A+B)′", "Y = (A+B)′"],
        primary: "(A+B)",
        barred: true,
        note: "或门输出端加反相圈。",
      },
      boolean: {
        forms: ["(A + B)′"],
        primary: "(A + B)′",
        note: "括号不能省，否则 A + B′ 是另一个函数。",
      },
      set: {
        forms: ["(A ∪ B)ᶜ"],
        primary: "(A ∪ B)ᶜ",
        note: "并集的补集；由德摩根律等于 Aᶜ ∩ Bᶜ。",
      },
      probability: {
        forms: ["P((A ∪ B)ᶜ)"],
        primary: "P((A ∪ B)ᶜ)",
        note: "两个事件都不发生的概率，等于 1 − P(A ∪ B)。",
      },
    },
    gate: "NOR",
    arity: 2,
    example: {
      text: "F = (A+B)′",
      explain: "只有 A、B 都为 0 时输出 1；只要有一个为 1，输出就是 0。横线同样覆盖整个和项。",
    },
    confusions: [
      "¬(A+B) ≠ ¬A+¬B；后者等于 ¬(A·B)，也就是与非。",
      "德摩根律是这两个门最常考的转换：¬(A+B) = ¬A·¬B。",
    ],
    studio: { target: "gate", label: "去门级搭建试试只用或非门" },
  },
  {
    id: "buffer",
    glyph: "Y=A",
    zh: "缓冲器",
    en: "Buffer",
    symbols: [],
    keywords: ["缓冲器", "缓冲", "驱动", "整形", "buffer", "driver", "Y=A", "直通"],
    summary: "输出等于输入，用于驱动、隔离与整形",
    definition: "Y = A。逻辑上不改变取值；电气上提供驱动能力、隔离前后级、增加延迟。",
    variants: {
      discrete: {
        forms: ["A（原样）"],
        primary: "A",
        note: "命题逻辑里没有「缓冲」这个联结词：它就是命题本身。",
      },
      digital: {
        forms: ["Y = A"],
        primary: "Y = A",
        note: "三角形符号，输出端没有反相圈；与非门的区别就在这个小圆圈。",
      },
      boolean: {
        forms: ["A"],
        primary: "A",
        note: "恒等律：A·1 = A，A + 0 = A。缓冲器实现的就是这两条。",
      },
      set: null,
      probability: null,
    },
    gate: "BUFFER",
    arity: 1,
    example: {
      text: "Y = A",
      explain: "真值表只有两行且输出与输入相同；它的价值在电气特性，不在逻辑功能。",
    },
    confusions: [
      "缓冲器不是非门：输出端没有反相圈，逻辑值不变。",
      "逻辑等价不等于电气等价：缓冲器带来延迟和驱动能力，这两点在时序分析里不能忽略。",
    ],
    studio: { target: "gate", label: "去门级搭建放置缓冲器" },
  },
];

export const OPERATOR_MAP: Record<OperatorId, OperatorEntry> = OPERATORS.reduce(
  (acc, entry) => {
    acc[entry.id] = entry;
    return acc;
  },
  {} as Record<OperatorId, OperatorEntry>
);

export function operatorById(id: OperatorId): OperatorEntry {
  return OPERATOR_MAP[id];
}

/** 逻辑门 → 对应的运算条目，保证字号、符号、说明都来自同一份数据 */
export function operatorIdForGate(kind: GateKind): OperatorId {
  const map: Record<GateKind, OperatorId> = {
    AND: "and",
    OR: "or",
    NOT: "not",
    XOR: "xor",
    XNOR: "xnor",
    NAND: "nand",
    NOR: "nor",
    BUFFER: "buffer",
  };
  return map[kind];
}

/** 该运算在指定学科里是否有直接对应 */
export function variantFor(entry: OperatorEntry, discipline: Discipline): NotationVariant | null {
  return entry.variants[discipline] ?? null;
}

function haystack(entry: OperatorEntry): string {
  const parts = [
    entry.zh,
    entry.en,
    entry.summary,
    entry.definition,
    ...entry.symbols,
    ...entry.keywords,
  ];
  for (const variant of Object.values(entry.variants)) {
    if (variant) parts.push(variant.primary, ...variant.forms, variant.note);
  }
  return parts.join(" ").toLowerCase();
}

/**
 * 搜索：中英文名称、符号、同义词、口语说法都能命中。
 * 排序让「名称/符号精确命中」排在解释文字里偶然出现的前面。
 */
export function searchOperators(query: string, discipline: Discipline | "all" = "all"): OperatorEntry[] {
  const q = query.trim().toLowerCase();
  const pool = OPERATORS.filter(
    (entry) => discipline === "all" || entry.variants[discipline] !== null
  );
  if (q.length === 0) return pool;

  const scored = pool
    .map((entry, index) => {
      let score = 0;
      if (entry.zh.toLowerCase().includes(q)) score = Math.max(score, 3);
      if (entry.en.toLowerCase().includes(q)) score = Math.max(score, 3);
      if (entry.symbols.some((s) => s === q)) score = Math.max(score, 4);
      if (entry.keywords.some((k) => k.toLowerCase() === q)) score = Math.max(score, 4);
      if (entry.symbols.some((s) => s.includes(q))) score = Math.max(score, 2);
      if (entry.keywords.some((k) => k.toLowerCase().includes(q))) score = Math.max(score, 2);
      if (haystack(entry).includes(q)) score = Math.max(score, 1);
      return { entry, score, index };
    })
    .filter((row) => row.score > 0);

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((row) => row.entry);
}

/** 所有可复制的符号，按运算分组，供百科页顶部的符号条使用 */
export function allSymbols(): Array<{ symbol: string; operator: OperatorEntry }> {
  const out: Array<{ symbol: string; operator: OperatorEntry }> = [];
  for (const entry of OPERATORS) {
    for (const symbol of entry.symbols) out.push({ symbol, operator: entry });
  }
  return out;
}
