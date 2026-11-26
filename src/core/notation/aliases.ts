/**
 * 符号别名表（叶子模块）
 *
 * 这里只放「字符 → 运算」的原始事实，不依赖 AST、解析器或任何 UI，
 * 因此 tokenizer 可以安全地引用它，不会形成循环依赖。
 *
 * 设计立场：
 *   - 同一运算允许多种写法，是因为不同教材确实如此，不是为了让解析器随便猜。
 *   - 所有别名只在「布尔 / 命题 / 集合 / 事件」这一共同结构内成立；
 *     它们不是同一个数学对象，具体语境由界面标注。
 */

export type AliasOperator = "not" | "and" | "or" | "xor" | "xnor" | "nand" | "nor";

export interface SymbolAlias {
  /** 可被直接输入的写法 */
  input: string;
  op: AliasOperator;
  /** 该写法最常出现的学科语境 */
  discipline: "discrete" | "digital" | "boolean" | "set" | "probability" | "any";
  /** 位置：前缀 / 中缀 / 后缀 */
  position: "prefix" | "infix" | "postfix";
  /** 语境提示，用于「解析说明」 */
  note: string;
}

/** 前缀取反 */
export const NOT_PREFIX_CHARS = ["!", "¬", "~"] as const;

/** 后缀取反：撇号、上划线、集合补集 */
export const NOT_POSTFIX_CHARS = ["'", "′", "ᶜ", "̅", "̄"] as const;

export const AND_CHARS = ["&", "·", "*", "∧", "∩", "⋅"] as const;
export const OR_CHARS = ["|", "+", "∨", "∪"] as const;
export const XOR_CHARS = ["^", "⊕", "△"] as const;
export const XNOR_CHARS = ["⊙", "↔"] as const;

/** 词形运算符（按长度降序匹配，避免 NAND 被读成 NOR） */
export const WORD_OPERATORS: Array<{ word: string; op: AliasOperator }> = [
  { word: "XNOR", op: "xnor" },
  { word: "NAND", op: "nand" },
  { word: "NOR", op: "nor" },
  { word: "XOR", op: "xor" },
  { word: "AND", op: "and" },
  { word: "OR", op: "or" },
  { word: "NOT", op: "not" },
];

export const ALIAS_TABLE: SymbolAlias[] = [
  { input: "!", op: "not", discipline: "any", position: "prefix", note: "编程与键盘输入的取反" },
  { input: "¬", op: "not", discipline: "discrete", position: "prefix", note: "命题逻辑的否定联结词" },
  { input: "~", op: "not", discipline: "boolean", position: "prefix", note: "布尔代数与程序中的按位取反" },
  { input: "A'", op: "not", discipline: "boolean", position: "postfix", note: "撇号只作用于紧邻的一个变量" },
  { input: "Ā", op: "not", discipline: "digital", position: "postfix", note: "上划线覆盖的范围就是取反的范围" },
  { input: "Aᶜ", op: "not", discipline: "set", position: "postfix", note: "相对于全集 U 的补集" },
  { input: "A NAND B", op: "nand", discipline: "digital", position: "infix", note: "先与后非，等价于 ¬(A∧B)" },
  { input: "A NOR B", op: "nor", discipline: "digital", position: "infix", note: "先或后非，等价于 ¬(A∨B)" },
  { input: "&", op: "and", discipline: "any", position: "infix", note: "编程写法的与" },
  { input: "∧", op: "and", discipline: "discrete", position: "infix", note: "命题逻辑的合取" },
  { input: "·", op: "and", discipline: "digital", position: "infix", note: "数字电路的布尔乘，不是算术乘法" },
  { input: "∩", op: "and", discipline: "set", position: "infix", note: "集合交集；用作逻辑与时是结构对应" },
  { input: "AB", op: "and", discipline: "boolean", position: "infix", note: "相邻文字默认按与解释" },
  { input: "|", op: "or", discipline: "any", position: "infix", note: "编程写法的或" },
  { input: "∨", op: "or", discipline: "discrete", position: "infix", note: "命题逻辑的析取（可兼或）" },
  { input: "+", op: "or", discipline: "digital", position: "infix", note: "数字电路的布尔加，1+1=1" },
  { input: "∪", op: "or", discipline: "set", position: "infix", note: "集合并集" },
  { input: "^", op: "xor", discipline: "any", position: "infix", note: "编程写法的异或" },
  { input: "⊕", op: "xor", discipline: "discrete", position: "infix", note: "异或：两者不同时为真" },
  { input: "△", op: "xor", discipline: "set", position: "infix", note: "集合对称差，结构上对应异或" },
  { input: "⊙", op: "xnor", discipline: "digital", position: "infix", note: "同或门，两者相同时为真" },
  { input: "↔", op: "xnor", discipline: "discrete", position: "infix", note: "双条件（等价）联结词" },
];

/** 输入中出现的、需要向用户说明「我们按什么读」的符号 */
export interface InputNotice {
  symbol: string;
  reading: string;
  detail: string;
  /** 该读法所属语境 */
  discipline: SymbolAlias["discipline"];
}

const NOTICE_RULES: Array<{ test: RegExp; notice: InputNotice }> = [
  {
    test: /\+/,
    notice: {
      symbol: "+",
      reading: "逻辑或",
      detail: "在布尔语境中 1 + 1 = 1；它不是算术加法。若要表达算术和，本工具不适用。",
      discipline: "digital",
    },
  },
  {
    test: /·|\*/,
    notice: {
      symbol: "·",
      reading: "逻辑与",
      detail: "在布尔语境中 A·B 表示合取，不是数值乘法。",
      discipline: "digital",
    },
  },
  {
    test: /∩/,
    notice: { symbol: "∩", reading: "交集", detail: "按集合语境读作交集，其真值结构与逻辑与一致，但对象是集合而不是命题。", discipline: "set" },
  },
  {
    test: /∪/,
    notice: { symbol: "∪", reading: "并集", detail: "按集合语境读作并集，其真值结构与逻辑或一致。", discipline: "set" },
  },
  {
    test: /△/,
    notice: { symbol: "△", reading: "对称差 / 异或", detail: "集合对称差与逻辑异或结构对应：恰属于其中一个集合。", discipline: "set" },
  },
  {
    test: /⊙|↔/,
    notice: { symbol: "⊙ / ↔", reading: "同或 / 等价", detail: "两式都表示「相同为真」，等价于 ¬(A ⊕ B)。", discipline: "discrete" },
  },
  {
    test: /ᶜ/,
    notice: { symbol: "ᶜ", reading: "补集", detail: "上标 c 表示相对于全集 U 的补集，作用范围是紧邻的集合或括号。", discipline: "set" },
  },
  {
    test: /['′]/,
    notice: { symbol: "'", reading: "取反", detail: "撇号只作用于紧邻的一个变量或括号；A·B′ 是 A·(¬B)，不是 ¬(A·B)。", discipline: "boolean" },
  },
  {
    test: /NAND|NOR/i,
    notice: { symbol: "NAND / NOR", reading: "先运算后取反", detail: "A NAND B 读作 ¬(A ∧ B)，不是 (¬A) ∧ B。", discipline: "digital" },
  },
  {
    test: /[A-Za-z]\s*[A-Za-z]|\)\s*[A-Za-z(]|[A-Za-z]\s*\(/,
    notice: { symbol: "相邻书写", reading: "隐式与", detail: "AB 与 A(B+C) 按 A·B、A·(B+C) 解析；这是布尔代数的省略乘号写法。", discipline: "boolean" },
  },
];

/** 隐式与的判定需要先剔除词形运算符，否则 AND 自身会被当成相邻变量 */
const WORD_OPERATOR_PATTERN = /\b(XNOR|NAND|NOR|XOR|AND|OR|NOT)\b/gi;
const JUXTAPOSITION_PATTERN = /[A-Za-z]\s*[A-Za-z]|\)\s*[A-Za-z(]|[A-Za-z]\s*\(/;

/**
 * 列出当前输入里「按哪种语境解释」的说明。
 * 只做解释，不做替换 —— 替换一律由词法器基于上下文完成。
 */
export function describeInputNotices(raw: string): InputNotice[] {
  const body = raw.replace(/^\s*[A-Za-z][A-Za-z0-9_]*\s*=\s*/, "");
  if (body.trim().length === 0) return [];
  const withoutWords = body.replace(WORD_OPERATOR_PATTERN, " ");
  return NOTICE_RULES.filter((rule) => {
    if (rule.notice.symbol === "相邻书写") return JUXTAPOSITION_PATTERN.test(withoutWords);
    return rule.test.test(body);
  }).map((rule) => rule.notice);
}
