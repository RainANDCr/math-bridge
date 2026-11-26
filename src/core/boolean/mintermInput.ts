/**
 * 最小项记号解析
 *
 * 允许学生直接粘贴课本站的写法：
 *   Σm(1,3,5,7)
 *   F(A,B,C) = Σm(1,3,5) + Σd(2,6)
 *   ∑m(0,2) + d(6)
 *
 * 这样「表达式 / 最小项 / 真值表」三种输入方式其实共用一个输入框，
 * 用户不必先切换到某个模式才能粘贴。
 */

export interface ParsedMintermInput {
  variables: string[] | null;
  minterms: number[];
  dontCares: number[];
  inferredVariables: number;
}

const SIGMA = /[Σ∑]/;

function parseNumberList(text: string): number[] | null {
  const cleaned = text.replace(/[，、\s]/g, ",").replace(/,+/g, ",").replace(/^,|,$/g, "");
  if (cleaned === "") return [];
  const parts = cleaned.split(",");
  const out: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    out.push(Number(part));
  }
  return out;
}

export function tryParseMintermNotation(source: string): ParsedMintermInput | null {
  if (!SIGMA.test(source)) return null;

  // 变量声明：F(A,B,C) 或 (A,B,C) = 或 A,B,C:
  let variables: string[] | null = null;
  const varMatch = /(?:[A-Za-z]\s*)?\(\s*([A-H](?:\s*[,，]\s*[A-H])*)\s*\)\s*=/.exec(source);
  if (varMatch) {
    variables = varMatch[1].split(/[,，]/).map((v) => v.trim().toUpperCase());
  }

  // 只保留 Σ 之后的记号部分
  const sigmaIndex = source.search(SIGMA);
  const body = source.slice(sigmaIndex);

  const minterms: number[] = [];
  const dontCares: number[] = [];

  const pattern = /(?:[Σ∑]\s*m?\s*\(([^)]*)\))|(?:\bd\s*\(([^)]*)\))/gi;
  let match: RegExpExecArray | null;
  let found = false;
  while ((match = pattern.exec(body)) !== null) {
    const numbers = parseNumberList(match[1] ?? match[2] ?? "");
    if (numbers === null) return null;
    found = true;
    if (match[1] !== undefined) minterms.push(...numbers);
    else dontCares.push(...numbers);
  }

  if (!found) {
    // 允许 Σ 后直接跟括号，例如 Σ(1,2,3)
    const direct = /[Σ∑]\s*\(([^)]*)\)/.exec(body);
    if (!direct) return null;
    const numbers = parseNumberList(direct[1]);
    if (numbers === null) return null;
    minterms.push(...numbers);
  }

  const all = [...minterms, ...dontCares];
  if (all.some((n) => n < 0)) return null;
  const maxIndex = all.length > 0 ? Math.max(...all) : 0;
  const needed = maxIndex === 0 ? 1 : Math.ceil(Math.log2(maxIndex + 1));

  return {
    variables,
    minterms: Array.from(new Set(minterms)).sort((a, b) => a - b),
    dontCares: Array.from(new Set(dontCares)).sort((a, b) => a - b),
    inferredVariables: Math.max(1, Math.min(6, needed)),
  };
}

export function formatMintermNotation(minterms: number[], dontCares: number[] = []): string {
  const parts: string[] = [];
  if (minterms.length > 0 || dontCares.length === 0) parts.push(`Σm(${minterms.join(", ")})`);
  if (dontCares.length > 0) parts.push(`+ Σd(${dontCares.join(", ")})`);
  return parts.join(" ");
}

/**
 * 解析「逗号分隔的编号」输入框（与 Σm 记号不同，这是逐格输入用的）。
 * 中文逗号、顿号、分号、空格都当作分隔符。
 */
export function parseIndexList(
  text: string
): { ok: true; values: number[] } | { ok: false; error: string } {
  const cleaned = text.replace(/[，、;；\s]+/g, ",").replace(/,+/g, ",").replace(/^,|,$/g, "");
  if (cleaned === "") return { ok: true, values: [] };
  const values: number[] = [];
  for (const part of cleaned.split(",")) {
    if (!/^\d+$/.test(part)) {
      return { ok: false, error: `“${part}” 不是有效的编号，只能填写非负整数` };
    }
    values.push(Number(part));
  }
  return { ok: true, values };
}
