import { bar, notaText, t, type NotaNode, type NotationMode } from "./notationTypes";

/**
 * 表达式输入框的符号按钮
 *
 * 这里只放**能敲出来的字符**，而不是渲染用的字形：
 * 数电教材里取反是上划线（`A̅`），但输入框里没法画横线，所以用撇号 `′` ——
 * 渲染时 `′` 会变成上划线，输入与显示因此不矛盾。
 *
 * 按钮上显示什么，必须和当前学科记法渲染出来的一致：
 * 在数电下按 `·`，公式里就是 `·`；切到集合记法，按的是 `∩`，公式里也是 `∩`。
 *
 * 取反是**后缀**而不是前缀，这一点很关键：教材写 `A′`，编辑时人也总是先写完 `A` 再取反。
 * 前缀按钮（旧版的 `!`）会把光标处的字符顶到后面去，于是 `F = ...` 变成 `!F = ...` ——
 * 赋值前缀认不出来，整行报语法错误。这不是用户的错。
 */

export type PaletteKind = "infix" | "postfix" | "prefix" | "literal";

export interface PaletteButton {
  id: string;
  /** 按钮上显示的字符 */
  label: string;
  /** 插入到表达式里的文本（不含两侧空格，由 applyPalette 处理） */
  insert: string;
  kind: PaletteKind;
  title: string;
}

type OperatorSet = { and: PaletteButton; or: PaletteButton; not: PaletteButton; xor: PaletteButton };

const OPERATORS: Record<Exclude<NotationMode, "all">, OperatorSet> = {
  digital: {
    and: { id: "and", label: "·", insert: "·", kind: "infix", title: "与（A·B）" },
    or: { id: "or", label: "+", insert: "+", kind: "infix", title: "或（A + B）" },
    not: { id: "not", label: "′", insert: "′", kind: "postfix", title: "非（公式里画成上划线；选中 A·B 点一下得 (A·B)′）" },
    xor: { id: "xor", label: "⊕", insert: "⊕", kind: "infix", title: "异或（A ⊕ B）" },
  },
  boolean: {
    and: { id: "and", label: "·", insert: "·", kind: "infix", title: "与（AB 也可，乘号可省）" },
    or: { id: "or", label: "+", insert: "+", kind: "infix", title: "或（A + B）" },
    not: { id: "not", label: "′", insert: "′", kind: "postfix", title: "非：选中 A·B 点一下得 (A·B)′" },
    xor: { id: "xor", label: "⊕", insert: "⊕", kind: "infix", title: "异或（A ⊕ B）" },
  },
  discrete: {
    and: { id: "and", label: "∧", insert: "∧", kind: "infix", title: "合取（A ∧ B）" },
    or: { id: "or", label: "∨", insert: "∨", kind: "infix", title: "析取（A ∨ B）" },
    not: { id: "not", label: "¬", insert: "¬", kind: "prefix", title: "否定：选中 A·B 点一下得 ¬(A·B)" },
    xor: { id: "xor", label: "⊕", insert: "⊕", kind: "infix", title: "异或（A ⊕ B）" },
  },
  set: {
    and: { id: "and", label: "∩", insert: "∩", kind: "infix", title: "交集（A ∩ B）" },
    or: { id: "or", label: "∪", insert: "∪", kind: "infix", title: "并集（A ∪ B）" },
    not: { id: "not", label: "ᶜ", insert: "ᶜ", kind: "postfix", title: "补集：选中 A ∩ B 点一下得 (A ∩ B)ᶜ" },
    xor: { id: "xor", label: "△", insert: "△", kind: "infix", title: "对称差（A △ B）" },
  },
  probability: {
    and: { id: "and", label: "∩", insert: "∩", kind: "infix", title: "事件交（A ∩ B）" },
    or: { id: "or", label: "∪", insert: "∪", kind: "infix", title: "事件并（A ∪ B）" },
    not: { id: "not", label: "ᶜ", insert: "ᶜ", kind: "postfix", title: "对立事件：选中 A ∩ B 点一下得 (A ∩ B)ᶜ" },
    xor: { id: "xor", label: "△", insert: "△", kind: "infix", title: "对称差（A △ B）" },
  },
};

const TAIL: PaletteButton[] = [
  { id: "lparen", label: "(", insert: "(", kind: "literal", title: "左括号" },
  { id: "rparen", label: ")", insert: ")", kind: "literal", title: "右括号" },
  { id: "zero", label: "0", insert: "0", kind: "literal", title: "常量 0" },
  { id: "one", label: "1", insert: "1", kind: "literal", title: "常量 1" },
];

/** 全学科对照没有单一写法，退到数电——教材里最常用的一套 */
function keyOf(mode: NotationMode): Exclude<NotationMode, "all"> {
  return mode === "all" ? "digital" : mode;
}

export function paletteFor(mode: NotationMode): PaletteButton[] {
  const ops = OPERATORS[keyOf(mode)];
  return [ops.and, ops.or, ops.not, ops.xor, ...TAIL];
}

const PLACEHOLDER: Record<Exclude<NotationMode, "all">, string> = {
  digital: "F = A·B + C′　　也可以粘贴 Σm(1,3,5,7)",
  boolean: "F = AB + C′　　也可以粘贴 Σm(1,3,5,7)",
  discrete: "F = (A ∧ B) ∨ ¬C　　也可以粘贴 Σm(1,3,5,7)",
  set: "F = (A ∩ B) ∪ Cᶜ　　也可以粘贴 Σm(1,3,5,7)",
  probability: "F = (A ∩ B) ∪ Cᶜ　　也可以粘贴 Σm(1,3,5,7)",
};

export function placeholderFor(mode: NotationMode): string {
  return PLACEHOLDER[keyOf(mode)];
}

const HINT: Record<Exclude<NotationMode, "all">, string> = {
  digital: "与 ·　或 +　非 ′　异或 ⊕　也可 & | ! ^",
  boolean: "与 ·（可省）　或 +　非 ′　异或 ⊕　也可 & | ! ^",
  discrete: "合取 ∧　析取 ∨　否定 ¬　异或 ⊕　也可 & | ! ^",
  set: "交 ∩　并 ∪　补 ᶜ　对称差 △　也可 & | ! ^",
  probability: "交 ∩　并 ∪　对立 ᶜ　对称差 △　也可 & | ! ^",
};

export function hintFor(mode: NotationMode): string {
  return HINT[keyOf(mode)];
}

/**
 * 输入符号与渲染符号不同形时，补一句说明。
 *
 * 说明里的示例**必须走公式的渲染器**，不能用组合上划线字符凑：
 * `A̅` 在字体里的横线会偏右偏高，跟公式里那条 `border-top` 的横线不是同一个东西 ——
 * 那么「示例」与「结果」就不一致，说明反而制造了新的疑问。
 */
export interface PaletteNote {
  before: string;
  /** 示例片段，与公式同一条渲染路径（结构化 bar 节点） */
  sample?: NotaNode;
  after?: string;
}

/**
 * 只有数电会真的「变样」：输入 `′`，公式里画成上划线。
 * 布尔代数的撇号渲染出来还是撇号，集合与概率的 `ᶜ` 本来就是上标 ——
 * 那些记法下再加一句「会变样」反而是错的，所以返回 null。
 */
const NOTE: Record<Exclude<NotationMode, "all">, PaletteNote | null> = {
  digital: {
    before: "撇号 ′ 在公式里画成上划线 ",
    sample: bar(t("A", "var")),
    after: " —— 键盘敲不出横线，两者是同一个「非」",
  },
  boolean: null,
  discrete: null,
  set: null,
  probability: null,
};

export function noteFor(mode: NotationMode): PaletteNote | null {
  return NOTE[keyOf(mode)];
}

/** 说明的纯文本形式：无障碍标签与测试用，与界面上看到的一致 */
export function noteText(note: PaletteNote | null): string | null {
  if (!note) return null;
  return note.before + (note.sample ? notaText(note.sample) : "") + (note.after ?? "");
}

/**
 * 把按钮应用到当前文本。
 *
 * 后缀取反遇到选区时整体加括号：选中 `A·B` 点 `′` 得到 `(A·B)′`，
 * 而不是把撇号丢在选区末尾 —— 后者会变成 `A·B′`，语义完全不同。
 */
export function applyPalette(
  button: PaletteButton,
  value: string,
  start: number,
  end: number
): { text: string; caret: number } {
  const from = Math.max(0, Math.min(start, value.length));
  const to = Math.max(from, Math.min(end, value.length));
  const selection = value.slice(from, to);
  const head = value.slice(0, from);
  const tail = value.slice(to);

  if (button.kind === "postfix") {
    if (selection) {
      const text = `${head}(${selection})${button.insert}${tail}`;
      return { text, caret: from + selection.length + button.insert.length + 2 };
    }
    return { text: head + button.insert + tail, caret: from + button.insert.length };
  }

  if (button.kind === "prefix") {
    if (selection) {
      const text = `${head}${button.insert}(${selection})${tail}`;
      return { text, caret: from + button.insert.length + selection.length + 2 };
    }
    return { text: head + button.insert + tail, caret: from + button.insert.length };
  }

  if (button.kind === "infix") {
    const insert = ` ${button.insert} `;
    return { text: head + insert + tail, caret: from + insert.length };
  }

  return { text: head + button.insert + tail, caret: from + button.insert.length };
}
