import { collectVariables, type BoolNode } from "../boolean/ast";
import { evaluateAtIndex } from "../boolean/evaluator";
import { parse } from "../boolean/parser";
import { renderNotation } from "./notationConversion";
import { DISCIPLINES, type Discipline, type NotationStyle } from "./notationTypes";

/**
 * 符号转换的等价性验证
 *
 * 这一步是整套符号系统的安全网：把渲染出来的文本**重新解析**，
 * 与原始 AST 在每个最小项上逐一比对。
 *
 * 只比较「渲染文本」是不够的 —— 少一层括号时文本看起来依然合理，
 * 只有回读求值才能发现 F = (A+B)·C 被写成了 A+B·C 这类语义漂移。
 */

export interface ModeVerification {
  mode: Discipline;
  ok: boolean;
  /** 回读所用的文本 */
  expression: string;
  /** 不一致的最小项说明 */
  mismatches: string[];
  rows: number;
}

/** 校验任意一段文本是否与给定 AST 等价（界面的复制、回填都走这里） */
export function verifyText(
  node: BoolNode,
  text: string,
  mode: Discipline = "discrete"
): ModeVerification {
  let back: BoolNode;
  try {
    back = parse(text);
  } catch (error) {
    return {
      mode,
      ok: false,
      expression: text,
      mismatches: [`无法回读：${(error as Error).message}`],
      rows: 0,
    };
  }

  const variables = Array.from(
    new Set([...collectVariables(node), ...collectVariables(back)])
  ).sort();
  const rows = 1 << variables.length;
  const mismatches: string[] = [];
  for (let index = 0; index < rows; index += 1) {
    const a = evaluateAtIndex(node, variables, index);
    const b = evaluateAtIndex(back, variables, index);
    if (a !== b) {
      mismatches.push(`m${index}：原式 ${a ? 1 : 0}，回读 ${b ? 1 : 0}`);
      if (mismatches.length >= 3) break;
    }
  }

  return { mode, ok: mismatches.length === 0, expression: text, mismatches, rows };
}

export function verifyMode(node: BoolNode, mode: Discipline, style: NotationStyle): ModeVerification {
  const rendered = renderNotation(node, mode, style);
  return verifyText(node, rendered.ascii, mode);
}

export function verifyAllModes(node: BoolNode, style: NotationStyle): ModeVerification[] {
  return DISCIPLINES.map((d) => verifyMode(node, d.id, style));
}
