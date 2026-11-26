import type { BooleanFunction } from "../boolean/model";
import {
  evaluatePosAt,
  evaluateSopAt,
  type PosClause,
  type PosResult,
  type MinimizeResult,
} from "./minimizer";
import type { Cube } from "./implicants";

/**
 * 化简结果验证
 *
 * 唯一可信的验证方式：把化简式与原始真值表逐行比对。
 * 无关项行（X）不参与比对，因为它在设计上「可以是 0 也可以是 1」。
 */

export interface Mismatch {
  index: number;
  expected: 0 | 1 | "X";
  actual: 0 | 1;
}

export interface ValidationReport {
  ok: boolean;
  totalRows: number;
  checkedRows: number;
  dontCareRows: number;
  mismatches: Mismatch[];
  message: string;
}

export function validateSop(fn: BooleanFunction, terms: Cube[]): ValidationReport {
  const total = 1 << fn.variables.length;
  const mismatches: Mismatch[] = [];
  let checked = 0;
  let dc = 0;

  for (let i = 0; i < total; i += 1) {
    const expected = fn.values[i] ?? "X";
    if (expected === "X") {
      dc += 1;
      continue;
    }
    const actual = evaluateSopAt(fn.variables, terms, i) ? 1 : 0;
    checked += 1;
    if (actual !== expected) mismatches.push({ index: i, expected, actual });
  }

  return {
    ok: mismatches.length === 0,
    totalRows: total,
    checkedRows: checked,
    dontCareRows: dc,
    mismatches,
    message:
      mismatches.length === 0
        ? `已在 ${checked} 行有效输入上逐一比对，化简式与原函数输出完全一致${dc ? `（另有 ${dc} 行无关项不参与比对）` : ""}。`
        : `发现 ${mismatches.length} 处不一致：第 ${mismatches
            .slice(0, 4)
            .map((m) => m.index)
            .join("、")} 行`,
  };
}

export function validatePos(fn: BooleanFunction, clauses: PosClause[]): ValidationReport {
  const total = 1 << fn.variables.length;
  const mismatches: Mismatch[] = [];
  let checked = 0;
  let dc = 0;

  for (let i = 0; i < total; i += 1) {
    const expected = fn.values[i] ?? "X";
    if (expected === "X") {
      dc += 1;
      continue;
    }
    const actual = evaluatePosAt(fn.variables, clauses, i) ? 1 : 0;
    checked += 1;
    if (actual !== expected) mismatches.push({ index: i, expected, actual });
  }

  return {
    ok: mismatches.length === 0,
    totalRows: total,
    checkedRows: checked,
    dontCareRows: dc,
    mismatches,
    message:
      mismatches.length === 0
        ? `已在 ${checked} 行有效输入上逐一比对，POS 与原函数输出完全一致。`
        : `POS 在 ${mismatches.length} 行上与真值表不符`,
  };
}

export interface FullValidation {
  sop: ValidationReport;
  pos: ValidationReport;
  sopResult: MinimizeResult;
  posResult: PosResult;
}

export function validateBoth(
  fn: BooleanFunction,
  sopResult: MinimizeResult,
  posResult: PosResult
): FullValidation {
  return {
    sop: validateSop(fn, sopResult.terms),
    pos: validatePos(fn, posResult.clauses),
    sopResult,
    posResult,
  };
}
