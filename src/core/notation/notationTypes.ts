/**
 * 跨学科符号系统的类型定义
 *
 * 核心立场：AST 是唯一事实，符号只是「同一个结构的另一种说法」。
 * 因此渲染器只能从 AST 生成记号，绝不允许从字符串替换生成记号。
 */

export type Discipline = "discrete" | "digital" | "boolean" | "set" | "probability";

/** 展示模式：五个学科 + 全学科对照 */
export type NotationMode = Discipline | "all";

/** 教材常见写法 / 简写写法 */
export type NotationStyle = "textbook" | "compact";

export interface DisciplineInfo {
  id: Discipline;
  zh: string;
  en: string;
  /** 导航与徽章用的短标签 */
  short: string;
  /** 该记法的适用语境，必须随公式一起展示 */
  caveat: string;
  /** 该学科对「+」和「·」的态度，用于易混淆提示 */
  arithmeticNote: string;
}

export const DISCIPLINES: DisciplineInfo[] = [
  {
    id: "discrete",
    zh: "离散数学",
    en: "Discrete Mathematics",
    short: "离散",
    caveat: "命题逻辑记法：A、B、C 是命题变元，∧ 合取、∨ 析取、¬ 否定，真值表定义其含义。",
    arithmeticNote: "∧ ∨ 不是算术运算；⊕ 是异或，不满足结合律之外的普通加法直觉。",
  },
  {
    id: "digital",
    zh: "数字电路",
    en: "Digital Electronics",
    short: "数电",
    caveat: "逻辑门记法：· 表示与、+ 表示或、上划线表示取反；这些是布尔运算，不是算术乘加。",
    arithmeticNote: "1 + 1 = 1，1·1 = 1；这里的 + 与 · 是布尔运算。",
  },
  {
    id: "boolean",
    zh: "布尔代数",
    en: "Boolean Algebra",
    short: "布尔",
    caveat: "代数记法：相邻文字表示相乘（与），+ 表示相加（或），撇号表示补元。",
    arithmeticNote: "补元满足 A + A′ = 1、A·A′ = 0；不要与普通代数的不定元混淆。",
  },
  {
    id: "set",
    zh: "集合论",
    en: "Set Theory",
    short: "集合",
    caveat: "把 A、B、C 解释为全集 U 的子集：∩ 交集、∪ 并集、ᶜ 补集、△ 对称差。",
    arithmeticNote: "这是结构对应，不是同一个对象：命题的真假对应集合的属于关系。",
  },
  {
    id: "probability",
    zh: "概率论",
    en: "Probability Theory",
    short: "概率",
    caveat: "把 A、B、C 解释为样本空间中的事件：P(A ∩ B) 表示两事件同时发生的概率。",
    arithmeticNote: "P(A∩B) = P(A)P(B) 只在独立时成立；P(A∪B) = P(A)+P(B)−P(A∩B) 恒成立。",
  },
];

export const DISCIPLINE_MAP: Record<Discipline, DisciplineInfo> = DISCIPLINES.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<Discipline, DisciplineInfo>
);

export function disciplineInfo(mode: NotationMode): DisciplineInfo | null {
  return mode === "all" ? null : DISCIPLINE_MAP[mode];
}

/* ==========================================================================
   记号的中间表示
   —— 上划线与上标必须结构化，否则界面只能靠字符串拼 HTML，容易出现
      「上划线覆盖范围不对」这类看不出错但意思全反的问题。
   ========================================================================== */

export type NotaRole = "var" | "const" | "op" | "paren" | "call" | "space";

export type NotaNode =
  | { kind: "text"; text: string; role: NotaRole }
  | { kind: "seq"; children: NotaNode[] }
  | { kind: "bar"; children: NotaNode }
  | { kind: "sup"; text: string };

export function t(text: string, role: NotaRole = "op"): NotaNode {
  return { kind: "text", text, role };
}

export function seq(children: NotaNode[]): NotaNode {
  return { kind: "seq", children };
}

export function bar(children: NotaNode): NotaNode {
  return { kind: "bar", children };
}

/** 单字符上划线（U+0305），用于纯文本回退 */
const COMBINING_OVERLINE = "\u0305";

/**
 * 把记号树摊平成纯文本。
 *
 * 上划线的处理必须诚实：单个字符可以用组合上划线，
 * 多个字符则退回「括号 + 撇号」，因为把每个字符都加上划线会变成
 * ¬A·¬B，与 ¬(A·B) 语义相反。
 */
export function notaText(node: NotaNode): string {
  switch (node.kind) {
    case "text":
      return node.text;
    case "sup":
      return node.text === "c" ? "ᶜ" : `^${node.text}`;
    case "seq":
      return node.children.map(notaText).join("");
    case "bar": {
      const inner = notaText(node.children);
      // 单个字符（或带撇号的单字符）可以直接加组合上划线
      if ([...inner].length === 1) return inner + COMBINING_OVERLINE;
      return `(${inner})′`;
    }
  }
}

/** 记号树是否包含上划线（用于提示「纯文本已改写为撇号」） */
export function hasBar(node: NotaNode): boolean {
  switch (node.kind) {
    case "text":
    case "sup":
      return false;
    case "bar":
      return true;
    case "seq":
      return node.children.some(hasBar);
  }
}

/* ==========================================================================
   运算符优先级（与解析器一致：OR < XOR < AND < NOT）
   ========================================================================== */

export const NOTA_PREC = { or: 1, xor: 2, and: 3, not: 4, atom: 5 } as const;

export function wrap(text: NotaNode, needed: boolean): NotaNode {
  return needed ? seq([t("(", "paren"), text, t(")", "paren")]) : text;
}

export interface RenderedNotation {
  mode: Discipline;
  nodes: NotaNode;
  /** 显示文本（含上划线 / 上标字符） */
  text: string;
  /** 纯文本回退：上划线改写为撇号，可被解析器读回 */
  ascii: string;
  /** 该写法成立的语境 */
  caveat: string;
  /** 数值计算需要的额外条件 */
  conditions?: string[];
}

export interface NotationSample {
  mode: Discipline;
  title: string;
  notation: RenderedNotation;
}
