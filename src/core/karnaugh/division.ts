import type { CellValue } from "../boolean/model";
import type { BoolNode } from "../boolean/ast";
import { buildCube, termToString, type Cube, type Literal } from "./implicants";
import { minimizeValues } from "./minimizer";

/**
 * 布尔除法与冗余项
 *
 * 代数除法只认「文字子集」：AB + AC 能提出 A，因为 A 是两个项共同的文字。
 * 但 x·y + ¬x·z 里找不到任何公共文字，代数除法什么也提不出来；
 * 而它其实等于 (x + z)·(¬x + y) —— 这一步需要布尔恒等式，不是文字匹配。
 *
 * 布尔除法的定义（精确除法）：
 *   求 Q 使 D·Q = F。
 *   在 D=1 的那些行上，Q 必须等于 F；在 D=0 的行上，D·Q 恒为 0，
 *   所以 Q 取什么都不影响乘积 —— 这些行是 Q 的无关项，正好用来化简 Q。
 *   前提是 F ⊆ D（F=1 的行必须落在 D=1 里），否则余式非空。
 *
 * 余式：R = F 中 D·Q 覆盖不到的部分。R 为空即整除。
 *
 * 冗余项（共识项）：若某个乘积项的全部格子都被同一输出的其他项覆盖，
 * 删掉它不改变函数 —— 它通常是另外两项的共识项。删掉之后，原本被它挡住的
 * 公因子才提得出来。
 */

export type Divisor =
  | { kind: "cube"; literals: Literal[] }
  | { kind: "clause"; literals: Literal[] };

export interface DivisionResult {
  divisor: Divisor;
  /** 商（已最小化） */
  quotient: Cube[];
  /** 余式；整除时为空 */
  remainder: Cube[];
  exact: boolean;
  /** F ⊆ D 是否成立；不成立时一定除不尽 */
  implied: boolean;
  divisorText: string;
  quotientText: string;
  remainderText: string;
  /** 粗估代价：除式文字 + 商的门与文字 */
  cost: number;
}

export interface RedundantTerm {
  cube: Cube;
  text: string;
  /** 覆盖它的其他项 */
  coveredBy: number[];
}

function literalHolds(literal: Literal, row: number, variables: string[]): boolean {
  const position = variables.indexOf(literal.variable);
  if (position < 0) return true;
  const bit = ((row >> (variables.length - 1 - position)) & 1) === 1;
  return literal.negated ? !bit : bit;
}

function divisorHolds(divisor: Divisor, row: number, variables: string[]): boolean {
  if (divisor.kind === "cube") {
    return divisor.literals.every((literal) => literalHolds(literal, row, variables));
  }
  return divisor.literals.some((literal) => literalHolds(literal, row, variables));
}

function divisorText(divisor: Divisor): string {
  if (divisor.literals.length === 0) return divisor.kind === "cube" ? "1" : "0";
  const symbols = divisor.literals.map(
    (literal) => `${literal.negated ? "¬" : ""}${literal.variable}`
  );
  return divisor.kind === "cube" ? symbols.join("·") : `(${symbols.join(" + ")})`;
}

function cubeText(cube: Cube): string {
  return cube.literals.length === 0 ? "1" : termToString(cube.literals);
}

function termsText(cubes: Cube[]): string {
  if (cubes.length === 0) return "0";
  return cubes.map(cubeText).join(" + ");
}

/**
 * 找出被其他项完全覆盖的乘积项（共识项）。
 *
 * 只按格子判断，不猜「哪两项的共识」：一个项可能同时被三项覆盖，
 * 也可能删掉一个之后另一个才变成冗余 —— 所以反复扫描到稳定。
 */
export function pruneRedundantTerms(
  _variables: string[],
  values: CellValue[],
  terms: Cube[]
): { terms: Cube[]; removed: RedundantTerm[] } {
  const current = terms.map((term) => term);
  const removed: RedundantTerm[] = [];
  let changed = true;
  let guard = 0;

  while (changed && guard < 32) {
    changed = false;
    guard += 1;
    for (let index = 0; index < current.length; index += 1) {
      const term = current[index];
      const others = current.filter((_, i) => i !== index);
      const allCovered = term.cells.every((cell) => {
        // 只要求覆盖「函数值为 1 的格子」：X 格子不必被覆盖
        if (values[cell] !== 1) return true;
        return others.some((other) => other.cells.includes(cell));
      });
      if (!allCovered) continue;

      const coveredBy: number[] = [];
      current.forEach((other, i) => {
        if (i === index) return;
        if (term.cells.some((cell) => other.cells.includes(cell))) coveredBy.push(i);
      });

      removed.push({ cube: term, text: cubeText(term), coveredBy });
      current.splice(index, 1);
      changed = true;
      break;
    }
  }

  return { terms: current, removed };
}

/**
 * 布尔除法：求 Q 使 D·Q = F。
 *
 * 商用「D=1 时等于 F、D=0 时随意」的最小化得到；
 * 再用逐行求值确认 D·Q 与 F 是否完全一致，不一致就给出余式。
 */
export function booleanDivide(
  variables: string[],
  values: CellValue[],
  _dividend: Cube[],
  divisor: Divisor
): DivisionResult {
  const total = 1 << variables.length;
  const quotientValues: CellValue[] = new Array(total).fill("X");
  let implied = true;

  for (let row = 0; row < total; row += 1) {
    const holds = divisorHolds(divisor, row, variables);
    if (values[row] === 1 && !holds) implied = false;
    if (!holds) {
      quotientValues[row] = "X";
      continue;
    }
    quotientValues[row] = values[row];
  }

  const quotient = minimizeValues(variables, quotientValues);

  // 逐行验证 D·Q：只要有一行 D=1、Q=1、F=0，或 D=1、Q=0、F=1，就不整除
  const remainderRows: number[] = [];
  let exact = true;
  for (let row = 0; row < total; row += 1) {
    if (values[row] === "X") continue;
    const holds = divisorHolds(divisor, row, variables);
    const q = quotient.terms.some((term) => term.cells.includes(row)) ? 1 : 0;
    const product = holds ? q : 0;
    if (values[row] === 1 && product === 0) {
      exact = false;
      remainderRows.push(row);
    }
    if (values[row] === 0 && product === 1) {
      // 商在 D=1 上是照抄 F 的，正常不会发生；一旦发生就是算法出错
      exact = false;
    }
  }

  const remainderValues: CellValue[] = new Array(total).fill(0);
  for (const row of remainderRows) remainderValues[row] = 1;
  const remainder = remainderRows.length === 0 ? [] : minimizeValues(variables, remainderValues).terms;

  return {
    divisor,
    quotient: quotient.terms,
    remainder,
    exact,
    implied,
    divisorText: divisorText(divisor),
    quotientText: quotient.expression,
    remainderText: remainder.length === 0 ? "0" : termsText(remainder),
    cost: divisor.literals.length + 1 + quotient.termCount + quotient.literalCount,
  };
}

/** 参考代价：两级与或式的文字数（不含 OR 门） */
export function twoLevelLiterals(dividend: Cube[]): number {
  return dividend.reduce((acc, cube) => acc + cube.literals.length, 0);
}

function allClauses(variables: string[]): Divisor[] {
  const clauses: Divisor[] = [];
  // 单文字和项
  for (const variable of variables) {
    clauses.push({ kind: "clause", literals: [{ variable, negated: false }] });
    clauses.push({ kind: "clause", literals: [{ variable, negated: true }] });
  }
  // 双文字和项
  for (let i = 0; i < variables.length; i += 1) {
    for (let j = i + 1; j < variables.length; j += 1) {
      for (const negatedI of [false, true]) {
        for (const negatedJ of [false, true]) {
          clauses.push({
            kind: "clause",
            literals: [
              { variable: variables[i], negated: negatedI },
              { variable: variables[j], negated: negatedJ },
            ],
          });
        }
      }
    }
  }
  return clauses;
}

/**
 * 在「乘积项 + 单/双文字和项」里找最省的精确除式。
 *
 * 先做一次 F ⊆ D 的快速筛选：不满足的候选根本不可能整除，
 * 不必为它跑一遍最小化。返回按估计代价排序的前若干名。
 */
export function bestBooleanFactors(
  variables: string[],
  values: CellValue[],
  dividend: Cube[],
  limit = 3
): DivisionResult[] {
  const candidates: Divisor[] = [];
  for (const cube of dividend) {
    if (cube.literals.length >= 1) candidates.push({ kind: "cube", literals: cube.literals });
  }
  candidates.push(...allClauses(variables));

  const results: DivisionResult[] = [];
  for (const candidate of candidates) {
    const total = 1 << variables.length;
    let implied = true;
    for (let row = 0; row < total && implied; row += 1) {
      if (values[row] === 1 && !divisorHolds(candidate, row, variables)) implied = false;
    }
    if (!implied) continue;

    const result = booleanDivide(variables, values, dividend, candidate);
    if (result.exact) results.push(result);
  }

  results.sort((a, b) => a.cost - b.cost);
  const seen = new Set<string>();
  const unique: DivisionResult[] = [];
  for (const result of results) {
    const key = `${result.divisorText}=>${result.quotientText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(result);
    if (unique.length >= limit) break;
  }
  return unique;
}

/** 把一个乘积项转成布尔除法的除式（cube 形式） */
export function cubeDivisor(cube: Cube): Divisor {
  return { kind: "cube", literals: cube.literals };
}

/** 用项集重建一个立方体（给界面/测试用） */
export function cubeFromLiterals(literals: Literal[], variables: string[]): Cube {
  const n = variables.length;
  let mask = 0;
  let base = 0;
  for (const literal of literals) {
    const position = variables.indexOf(literal.variable);
    if (position < 0) continue;
    const bit = n - 1 - position;
    mask |= 1 << bit;
    if (!literal.negated) base |= 1 << bit;
  }
  return buildCube(base, mask, variables);
}

/**
 * 把「与或式」形状的 AST 展开成乘积项列表。
 *
 * 只接受 OR / AND / 变量 / 单变量取反 / 常量：
 * 遇到异或或嵌套的与非结构就返回 null —— 宁可说「做不到」，
 * 不要把不是乘积项的东西硬当成乘积项。
 */
export function sopTermsFromAst(node: BoolNode): Literal[][] | null {
  switch (node.kind) {
    case "const":
      return node.value === 1 ? [[]] : [];
    case "var":
      return [[{ variable: node.name, negated: false }]];
    case "not":
      if (node.operand.kind === "var") {
        return [[{ variable: node.operand.name, negated: true }]];
      }
      return null;
    case "and": {
      const left = sopTermsFromAst(node.left);
      const right = sopTermsFromAst(node.right);
      if (!left || !right) return null;
      if (left.length !== 1 || right.length !== 1) return null;
      return [mergeLiterals(left[0], right[0])];
    }
    case "or": {
      const left = sopTermsFromAst(node.left);
      const right = sopTermsFromAst(node.right);
      if (!left || !right) return null;
      return [...left, ...right];
    }
    default:
      return null;
  }
}

/** 合并两个项的文字：重复的去掉，互补的让整项归零（返回空数组表示矛盾） */
function mergeLiterals(a: Literal[], b: Literal[]): Literal[] {
  const merged = new Map<string, Literal>();
  for (const literal of [...a, ...b]) {
    const key = `${literal.negated ? "!" : ""}${literal.variable}`;
    const opposite = `${literal.negated ? "" : "!"}${literal.variable}`;
    if (merged.has(opposite)) return [];
    merged.set(key, literal);
  }
  return [...merged.values()];
}
