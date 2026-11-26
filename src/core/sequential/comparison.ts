import {
  deriveSequential,
  encodingOf,
  nextStateOf,
  stateBitsOf,
  type EncodingScheme,
  type StateMachine,
} from "./machine";
import type { StateReduction } from "./reduction";

/**
 * 编码方案的代价对比
 *
 * 二进制与 one-hot 不是「谁更先进」，而是一组权衡：
 *   · 二进制：ceil(log2 n) 个触发器，次态要经过卡诺图化简，方程深；
 *   · one-hot：n 个触发器，每个 D_i 就是「进入该状态的所有转移」之和，方程浅、
 *     直接从状态图读出，不需要化简 —— FPGA 里触发器便宜、门贵，所以常用。
 *
 * 这里把同一台机器的四种组合都真推导一遍，用同一套计价规则比较，
 * 而不是只喊口号。
 */

export interface DesignVariant {
  key: string;
  label: string;
  detail: string;
  stateCount: number;
  bits: number;
  flipFlops: number;
  literals: number;
  terms: number;
  equations: number;
  encoding: EncodingScheme;
  /** 是否就是当前正在编辑的方案 */
  current: boolean;
  /** 化简没有改变状态数时，这一行与「当前」重复 */
  duplicated: boolean;
}

export interface DesignComparison {
  variants: DesignVariant[];
  reducedCount: number;
  changed: boolean;
  /** 化简省下的触发器数（二进制编码下） */
  bitSaving: number;
  /** one-hot 相对二进制多用的触发器数（按化简后的状态数） */
  oneHotPremium: number;
}

function variantOf(
  key: string,
  label: string,
  detail: string,
  machine: StateMachine,
  current: boolean,
  duplicated: boolean
): DesignVariant {
  const design = deriveSequential(machine);
  return {
    key,
    label,
    detail,
    stateCount: machine.stateCount,
    bits: design.stateBits,
    flipFlops: design.stateBits,
    literals: design.totalLiterals,
    terms: design.totalTerms,
    equations: design.equations.length,
    encoding: encodingOf(machine),
    current,
    duplicated,
  };
}

export function compareDesigns(
  machine: StateMachine,
  reduction: StateReduction,
  /** 当前正在编辑的机器：应用化简后它与 machine（化简前）不是同一台 */
  live: StateMachine = machine
): DesignComparison {
  const activeEncoding = encodingOf(live);
  const merged = reduction.merged;

  const variants: DesignVariant[] = [
    variantOf(
      "current-binary",
      "当前 · 二进制",
      "每个状态位一个触发器，次态方程需要化简",
      { ...machine, encoding: "binary" },
      activeEncoding === "binary",
      false
    ),
    variantOf(
      "current-onehot",
      "当前 · one-hot",
      "每个状态一个触发器，D 直接由转移求和",
      { ...machine, encoding: "onehot" },
      activeEncoding === "onehot",
      false
    ),
    variantOf(
      "reduced-binary",
      "化简后 · 二进制",
      reduction.changed ? "合并等价状态后再用最少位宽编码" : "状态已最简，与前两行相同",
      { ...merged, encoding: "binary" },
      false,
      !reduction.changed
    ),
    variantOf(
      "reduced-onehot",
      "化简后 · one-hot",
      reduction.changed ? "合并等价状态后每态一位" : "状态已最简，与前两行相同",
      { ...merged, encoding: "onehot" },
      false,
      !reduction.changed
    ),
  ];

  // 高亮「正在使用的方案」：编码一致且状态数一致；化简无变化时只标前两行
  for (const variant of variants) {
    variant.current =
      variant.encoding === activeEncoding &&
      variant.stateCount === live.stateCount &&
      !variant.duplicated;
  }

  return {
    variants,
    reducedCount: reduction.mergedCount,
    changed: reduction.changed,
    bitSaving: stateBitsOf(reduction.originalCount) - stateBitsOf(reduction.mergedCount),
    oneHotPremium: reduction.mergedCount - stateBitsOf(reduction.mergedCount),
  };
}

// —— one-hot 方程的直接读法 ——

export interface OneHotTerm {
  target: number;
  source: number;
  input: number;
  /** 该转移对应的乘积项，如 Q1·¬X */
  text: string;
}

export function oneHotTerms(machine: StateMachine): OneHotTerm[] {
  const n = machine.stateCount;
  // 只有 1 个状态时没有状态位，也就没有 D 方程
  if (n <= 1) return [];
  const terms: OneHotTerm[] = [];
  for (let source = 0; source < n; source += 1) {
    for (let input = 0; input <= 1; input += 1) {
      const q = `Q${n - 1 - source}`;
      const condition = input === 1 ? machine.inputName : `¬${machine.inputName}`;
      terms.push({
        target: nextStateOf(machine, source, input),
        source,
        input,
        text: `${q}·${condition}`,
      });
    }
  }
  return terms;
}

export interface OneHotGroup {
  state: number;
  terms: OneHotTerm[];
  /** 直接读出的 D 方程（未化简） */
  expression: string;
}

export function oneHotGroups(machine: StateMachine): OneHotGroup[] {
  if (machine.stateCount <= 1) return [];
  const all = oneHotTerms(machine);
  return Array.from({ length: machine.stateCount }, (_, state) => {
    const terms = all.filter((term) => term.target === state);
    return {
      state,
      terms,
      expression: terms.length === 0 ? "0" : terms.map((term) => term.text).join(" + "),
    };
  });
}
