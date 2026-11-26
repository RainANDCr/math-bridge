import {
  nextStateOf,
  stateCodesOf,
  type StateMachine,
} from "./machine";

/**
 * 状态寄存器的竞争分析
 *
 * 前提先说清楚：**理想同步电路在时钟沿同时更新所有状态位，本来就没有竞争** ——
 * 每个触发器采样时看到的都是沿前的稳定状态。这里检查的是时钟偏斜的情形：
 * 先采样的触发器已经翻到新值，后采样的触发器却按「部分更新的状态」算次态，
 * 于是最终停在哪个状态取决于谁先翻转。
 *
 * 模型因此只看**一步**：
 *   一次转移变了 k 位，就把这 k 位的全部真子集组合当作「后采样时可能看到的状态」；
 *   对每个合法中间状态 t，算 δ(t, 输入)。
 *   若这些次态不全等于目标状态，就是**临界竞争**（可能进错状态）；
 *   若全都等于目标状态，是**非临界竞争**（有竞争，但无害）。
 *
 * 不用「反复迭代到稳定」的模型：那套判据属于电平异步电路，
 * 而计数器这类机器在任何固定输入下都不存在稳定状态，硬套只会得出「全部振荡」的假结论。
 *
 * 中间码字不落在任何状态上（3 状态机器空出来的码、one-hot 的多位为 1）时无法推演，
 * 如实记录，不臆造结论。
 */

export interface RaceOutcome {
  /** 中间状态；null 表示直接到达的目标状态 */
  via: number | null;
  viaCode: string | null;
  /** 在这个中间状态下、同一输入算出的次态 */
  next: number;
}

export interface RaceTransition {
  state: number;
  input: number;
  next: number;
  /** 发生变化的位（从高位数起，0 为最高位） */
  changedBits: number[];
  critical: boolean;
  /** 这条转移经过的全部合法中间状态 */
  intermediates: number[];
  /** 不落在任何状态上的中间码字 */
  invalidCodes: string[];
  outcomes: RaceOutcome[];
}

export interface RaceReport {
  codes: number[];
  stateBits: number;
  /** 所有「变了两位及以上」的转移 */
  races: RaceTransition[];
  criticalCount: number;
  /** 检查过的转移总数 */
  checked: number;
}

function codeString(code: number, bits: number): string {
  return code.toString(2).padStart(bits, "0");
}

export function analyzeRaces(machine: StateMachine, codesInput?: number[]): RaceReport {
  const codes = codesInput ?? stateCodesOf(machine);
  const maxCode = codes.reduce((acc, code) => Math.max(acc, code), 0);
  const stateBits = maxCode === 0 ? 0 : Math.floor(Math.log2(maxCode)) + 1;

  const codeToState = new Map<number, number>();
  codes.forEach((code, state) => codeToState.set(code, state));

  const races: RaceTransition[] = [];
  let checked = 0;

  for (let state = 0; state < machine.stateCount; state += 1) {
    for (let input = 0; input <= 1; input += 1) {
      checked += 1;
      const next = nextStateOf(machine, state, input);
      const diff = codes[state] ^ codes[next];
      const changedBits: number[] = [];
      for (let bit = 0; bit < stateBits; bit += 1) {
        if ((diff >> (stateBits - 1 - bit)) & 1) changedBits.push(bit);
      }
      // 只变一位时没有「谁先到」可言
      if (changedBits.length < 2) continue;

      const base = codes[state];
      const intermediates: number[] = [];
      const invalidCodes: string[] = [];
      const outcomes: RaceOutcome[] = [{ via: null, viaCode: null, next }];

      // 只枚举真子集：全部翻完就是目标状态本身，不是中间态
      const subsets = 1 << changedBits.length;
      for (let mask = 1; mask < subsets - 1; mask += 1) {
        let code = base;
        for (let i = 0; i < changedBits.length; i += 1) {
          if (mask & (1 << i)) code ^= 1 << (stateBits - 1 - changedBits[i]);
        }
        const intermediate = codeToState.get(code);
        if (intermediate === undefined) {
          invalidCodes.push(codeString(code, stateBits));
          continue;
        }
        if (!intermediates.includes(intermediate)) intermediates.push(intermediate);
        outcomes.push({
          via: intermediate,
          viaCode: codeString(code, stateBits),
          next: nextStateOf(machine, intermediate, input),
        });
      }

      const distinct = new Set(outcomes.map((outcome) => outcome.next));
      races.push({
        state,
        input,
        next,
        changedBits,
        critical: distinct.size > 1,
        intermediates,
        invalidCodes,
        outcomes,
      });
    }
  }

  return {
    codes,
    stateBits,
    races,
    criticalCount: races.filter((race) => race.critical).length,
    checked,
  };
}
