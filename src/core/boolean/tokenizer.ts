import { ExpressionError } from "./errors";
import {
  AND_CHARS,
  NOT_POSTFIX_CHARS,
  NOT_PREFIX_CHARS,
  OR_CHARS,
  WORD_OPERATORS,
  XNOR_CHARS,
  XOR_CHARS,
} from "../notation/aliases";

/**
 * 词法分析器
 *
 * 支持的运算符（同一语义允许多种写法，方便不同教材的学生直接粘贴）：
 *   NOT : !  ¬  ~  A'  A′  Aᶜ  A̅   NOT A
 *   AND : &  ·  *  ∧  ∩  AB（相邻书写）   A AND B
 *   OR  : |  +  ∨  ∪      A OR B
 *   XOR : ^  ⊕  △         A XOR B
 *   XNOR: ⊙  ↔            A XNOR B
 *   NAND: A NAND B        NOR: A NOR B
 *
 * 关键约定：
 *   1. 后缀取反（' ′ ᶜ ̅）是**后缀**运算符，只作用于紧邻的变量或括号，
 *      所以 A·B' 是 A·(¬B)，不是 ¬(A·B)。上划线的覆盖范围由此确定。
 *   2. 词形运算符只在「运算符应当出现」的位置识别（前一个记号是操作数）。
 *      因此 A AND B 读作 A∧B，而表达式开头的 AND 不会被误吞。
 *   3. 相邻变量是隐式与，但不能把 NAND / NOR 拆成变量。
 *
 * 变量统一视为单个大写字母（A–H），小写自动转大写。常量只有 0 和 1。
 */

export type TokenType =
  | "VAR"
  | "CONST"
  | "NOT"
  | "POSTFIX"
  | "AND"
  | "OR"
  | "XOR"
  | "XNOR"
  | "NAND"
  | "NOR"
  | "LPAREN"
  | "RPAREN";

export interface Token {
  type: TokenType;
  /** 原始文本 */
  text: string;
  /** 归一化后的值：变量名 / "0" | "1" / 运算符字符 */
  value: string;
  start: number;
  end: number;
  /** 词形运算符或隐式与的说明，用于「解析说明」 */
  note?: string;
}

const NOT_PREFIX = new Set<string>(NOT_PREFIX_CHARS);
const NOT_POSTFIX = new Set<string>(NOT_POSTFIX_CHARS);
const AND_SET = new Set<string>(AND_CHARS);
const OR_SET = new Set<string>(OR_CHARS);
const XOR_SET = new Set<string>(XOR_CHARS);
const XNOR_SET = new Set<string>(XNOR_CHARS);

/** 这些记号之后出现字母，说明此处应当是运算符 */
function isOperandEnd(type: TokenType): boolean {
  return type === "VAR" || type === "CONST" || type === "RPAREN";
}

interface WordMatch {
  op: "not" | "and" | "or" | "xor" | "xnor" | "nand" | "nor";
  length: number;
}

/** 在 pos 处匹配词形运算符；要求右侧不是字母数字，避免 ANDB 被误读 */
function matchWord(source: string, pos: number, allowPrefixNot: boolean): WordMatch | null {
  const rest = source.slice(pos, pos + 4);
  const upper = rest.toUpperCase();
  for (const entry of WORD_OPERATORS) {
    if (!upper.startsWith(entry.word)) continue;
    const after = source[pos + entry.word.length];
    if (after !== undefined && /[A-Za-z0-9_]/.test(after)) continue;
    if (entry.op === "not" && !allowPrefixNot) continue;
    if (entry.op !== "not" && allowPrefixNot) continue;
    return { op: entry.op, length: entry.word.length };
  }
  return null;
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  /** 处理紧跟在变量或右括号之后的后缀取反，可连续出现（A''） */
  const pushPostfix = (from: number): number => {
    let cursor = from;
    while (cursor < source.length && NOT_POSTFIX.has(source[cursor])) {
      tokens.push({
        type: "POSTFIX",
        text: source[cursor],
        value: "!",
        start: cursor,
        end: cursor + 1,
        note: source[cursor] === "ᶜ" ? "补集" : source[cursor] === "'" || source[cursor] === "′" ? "撇号取反" : "上划线取反",
      });
      cursor += 1;
    }
    return cursor;
  };

  while (i < source.length) {
    const ch = source[i];

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\u3000") {
      i += 1;
      continue;
    }

    if (ch === "(" || ch === "（") {
      tokens.push({ type: "LPAREN", text: ch, value: "(", start: i, end: i + 1 });
      i += 1;
      continue;
    }
    if (ch === ")" || ch === "）") {
      const end = i + 1;
      tokens.push({ type: "RPAREN", text: ch, value: ")", start: i, end });
      i = pushPostfix(end);
      continue;
    }

    if (NOT_PREFIX.has(ch)) {
      tokens.push({ type: "NOT", text: ch, value: "!", start: i, end: i + 1 });
      i += 1;
      continue;
    }
    if (AND_SET.has(ch)) {
      tokens.push({ type: "AND", text: ch, value: "&", start: i, end: i + 1 });
      i += 1;
      continue;
    }
    if (OR_SET.has(ch)) {
      tokens.push({ type: "OR", text: ch, value: "|", start: i, end: i + 1 });
      i += 1;
      continue;
    }
    if (XOR_SET.has(ch)) {
      tokens.push({ type: "XOR", text: ch, value: "^", start: i, end: i + 1 });
      i += 1;
      continue;
    }
    if (XNOR_SET.has(ch)) {
      tokens.push({ type: "XNOR", text: ch, value: "⊙", start: i, end: i + 1 });
      i += 1;
      continue;
    }

    if (ch === "0" || ch === "1") {
      const end = i + 1;
      tokens.push({ type: "CONST", text: ch, value: ch, start: i, end });
      i = pushPostfix(end);
      continue;
    }

    if (/[A-Za-z]/.test(ch)) {
      const prev = tokens[tokens.length - 1];
      const operatorSlot = prev !== undefined && isOperandEnd(prev.type);
      const word = matchWord(source, i, !operatorSlot);
      if (word) {
        const text = source.slice(i, i + word.length);
        const type: TokenType =
          word.op === "not"
            ? "NOT"
            : word.op === "and"
            ? "AND"
            : word.op === "or"
            ? "OR"
            : word.op === "xor"
            ? "XOR"
            : word.op === "xnor"
            ? "XNOR"
            : word.op === "nand"
            ? "NAND"
            : "NOR";
        tokens.push({ type, text, value: text, start: i, end: i + word.length, note: `词形运算符 ${text.toUpperCase()}` });
        i += word.length;
        continue;
      }

      const name = ch.toUpperCase();
      if (name > "H") {
        throw new ExpressionError(
          `变量名 “${ch}” 超出支持范围`,
          i,
          "支持 A–H 共 8 个变量，请使用单个字母（A、B、C…）；若想写运算符，请用 & | ! ^ 或词形 AND / OR / NOT",
          1
        );
      }
      const end = i + 1;
      tokens.push({
        type: "VAR",
        text: ch,
        value: name,
        start: i,
        end,
        note: operatorSlot ? "与左侧操作数相邻，按隐式与解析" : undefined,
      });
      i = pushPostfix(end);
      continue;
    }

    throw new ExpressionError(
      `无法识别的字符 “${ch}”`,
      i,
      "常用符号：· 表示与，+ 表示或，′ 表示非，⊕ 表示异或；也可写 & | ! ^，( ) 用于分组，0 / 1 为常量",
      1
    );
  }

  return tokens;
}
