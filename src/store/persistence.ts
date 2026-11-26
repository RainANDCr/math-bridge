import type { CellValue } from "../core/boolean/model";
import type { NotationMode, NotationStyle } from "../core/notation/notationTypes";

/**
 * 本地持久化
 *
 * 全部数据留在浏览器 localStorage，没有账号、没有后端。
 * 导入文件必须先完整校验，校验通过才允许覆盖当前实验。
 */

export const STORAGE_KEY = "mathbridge.state.v1";
export const EXPORT_KIND = "mathbridge.experiment";
export const EXPORT_VERSION = 1;

export type StudioKey =
  | "overview"
  | "logic"
  | "notation"
  | "karnaugh"
  | "multi"
  | "sequential"
  | "gate"
  | "probability"
  | "connection"
  | "reference";

export const STUDIO_KEYS: StudioKey[] = [
  "overview",
  "logic",
  "notation",
  "karnaugh",
  "multi",
  "sequential",
  "gate",
  "probability",
  "connection",
  "reference",
];

export interface ManualGroupData {
  id: string;
  cells: number[];
}

export interface ExperimentData {
  kind: typeof EXPORT_KIND;
  version: number;
  savedAt: number;
  studio: StudioKey;
  theme: "dark" | "light";
  expression: string;
  variables: string[];
  values: CellValue[];
  probabilities: number[];
  manualGroups: ManualGroupData[];
  trials: number;
  seed: number;
  recentExpressions: string[];
  /** 符号模式与记法风格；旧文件没有这两个字段时回落到默认值 */
  notationMode: NotationMode;
  notationStyle: NotationStyle;
}

const VALID_VARIABLES = ["A", "B", "C", "D", "E", "F", "G", "H"];
const ALLOWED_TRIALS = [100, 1000, 10000, 100000];

function isCellValue(v: unknown): v is CellValue {
  return v === 0 || v === 1 || v === "X";
}

export interface ValidationResult {
  ok: boolean;
  data?: ExperimentData;
  error?: string;
}

/**
 * 结构校验。任何一条不满足都返回可读的错误，绝不静默修补。
 */
export function validateExperiment(raw: unknown): ValidationResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "文件内容不是一个 JSON 对象" };
  }
  const obj = raw as Record<string, unknown>;

  if (obj.kind !== EXPORT_KIND) {
    return {
      ok: false,
      error: `这不是 MATH BRIDGE 实验文件（缺少 "kind": "${EXPORT_KIND}"）`,
    };
  }

  const version = obj.version;
  if (typeof version !== "number" || !Number.isInteger(version)) {
    return { ok: false, error: "缺少有效的 version 字段" };
  }
  if (version > EXPORT_VERSION) {
    return { ok: false, error: `文件版本 ${version} 高于当前程序支持的 ${EXPORT_VERSION}` };
  }

  const variables = obj.variables;
  if (!Array.isArray(variables) || variables.length > 6) {
    return { ok: false, error: "variables 必须是长度不超过 6 的数组" };
  }
  const varList = variables as unknown[];
  if (!varList.every((v) => typeof v === "string" && VALID_VARIABLES.includes(v))) {
    return { ok: false, error: "variables 中出现不支持的变量名（仅允许 A–H）" };
  }
  if (new Set(varList).size !== varList.length) {
    return { ok: false, error: "variables 中存在重复变量" };
  }

  const expectedLength = 1 << varList.length;
  const values = obj.values;
  if (!Array.isArray(values) || values.length !== expectedLength) {
    return {
      ok: false,
      error: `values 长度应为 2^${varList.length} = ${expectedLength}，实际为 ${
        Array.isArray(values) ? values.length : "非数组"
      }`,
    };
  }
  if (!(values as unknown[]).every(isCellValue)) {
    return { ok: false, error: "values 中只能出现 0、1 或字符串 \"X\"" };
  }

  const probabilities = obj.probabilities;
  const probs = Array.isArray(probabilities) ? probabilities : [];
  if (!probs.every((p) => typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1)) {
    return { ok: false, error: "probabilities 中必须是 0–1 之间的数字" };
  }

  const groupsRaw = Array.isArray(obj.manualGroups) ? obj.manualGroups : [];
  const manualGroups: ManualGroupData[] = [];
  for (const g of groupsRaw) {
    if (typeof g !== "object" || g === null) {
      return { ok: false, error: "manualGroups 的每一项必须是对象" };
    }
    const item = g as Record<string, unknown>;
    if (typeof item.id !== "string" || !Array.isArray(item.cells)) {
      return { ok: false, error: "manualGroups 的每一项需要 id 与 cells" };
    }
    const cells = item.cells as unknown[];
    if (
      !cells.every(
        (c) => typeof c === "number" && Number.isInteger(c) && c >= 0 && c < expectedLength
      )
    ) {
      return { ok: false, error: "manualGroups 中的格子编号超出当前变量范围" };
    }
    manualGroups.push({ id: item.id, cells: cells as number[] });
  }

  const trials = typeof obj.trials === "number" && ALLOWED_TRIALS.includes(obj.trials) ? obj.trials : 1000;
  const seed =
    typeof obj.seed === "number" && Number.isFinite(obj.seed) ? Math.floor(obj.seed) : 20260101;
  const theme = obj.theme === "light" ? "light" : "dark";
  const studio = STUDIO_KEYS.includes(obj.studio as StudioKey)
    ? (obj.studio as StudioKey)
    : "overview";
  const expression = typeof obj.expression === "string" ? obj.expression : "";
  const NOTATION_MODES: NotationMode[] = ["discrete", "digital", "boolean", "set", "probability", "all"];
  const notationMode = NOTATION_MODES.includes(obj.notationMode as NotationMode)
    ? (obj.notationMode as NotationMode)
    : "digital";
  const notationStyle: NotationStyle = obj.notationStyle === "compact" ? "compact" : "textbook";
  const recent = Array.isArray(obj.recentExpressions)
    ? (obj.recentExpressions as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 8)
    : [];

  return {
    ok: true,
    data: {
      kind: EXPORT_KIND,
      version: EXPORT_VERSION,
      savedAt: typeof obj.savedAt === "number" ? obj.savedAt : Date.now(),
      studio,
      theme,
      expression,
      variables: varList as string[],
      values: values as CellValue[],
      probabilities: varList.map((_, i) => (probs[i] as number | undefined) ?? 0.5),
      manualGroups,
      trials,
      seed,
      recentExpressions: recent,
      notationMode,
      notationStyle,
    },
  };
}

export function serializeExperiment(data: ExperimentData): string {
  return JSON.stringify({ ...data, savedAt: Date.now() }, null, 2);
}

export function parseExperimentJson(text: string): ValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `JSON 解析失败：${(error as Error).message}` };
  }
  return validateExperiment(raw);
}

export function loadFromStorage(): ExperimentData | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (!text) return null;
    const result = validateExperiment(JSON.parse(text));
    return result.ok ? result.data ?? null : null;
  } catch {
    return null;
  }
}

export function saveToStorage(data: ExperimentData): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearStorage(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 存储被禁用时忽略 */
  }
}
