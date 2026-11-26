import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ALL_VARIABLES,
  functionFromExpression,
  functionFromMinterms,
  functionFromValues,
  withCellValue,
  type BooleanFunction,
  type CellValue,
} from "../core/boolean/model";
import { ExpressionError } from "../core/boolean/errors";
import { formatMintermNotation, tryParseMintermNotation } from "../core/boolean/mintermInput";
import { studioFromHash } from "../app/routes";
import type { NotationMode, NotationStyle } from "../core/notation/notationTypes";
import {
  clearStorage,
  loadFromStorage,
  saveToStorage,
  serializeExperiment,
  type ExperimentData,
  type ManualGroupData,
  type StudioKey,
} from "./persistence";

export const DEFAULT_EXPRESSION = "F = A·B + C";

export interface Toast {
  id: number;
  kind: "ok" | "warn" | "error";
  text: string;
}

export interface ManualState {
  groups: ManualGroupData[];
  past: ManualGroupData[][];
  future: ManualGroupData[][];
}

export interface AppState {
  studio: StudioKey;
  theme: "dark" | "light";
  fn: BooleanFunction;
  /** 已提交的可解析文本（表达式或 Σm 记号） */
  expressionInput: string;
  /** 输入框当前内容（可能暂时非法） */
  expressionDraft: string;
  probabilities: Record<string, number>;
  manual: ManualState;
  trials: number;
  seed: number;
  useFixedSeed: boolean;
  recentExpressions: string[];
  /** 符号体系：只影响展示，不影响 fn */
  notationMode: NotationMode;
  notationStyle: NotationStyle;
  toast: Toast | null;
}

export interface ApplyResult {
  ok: boolean;
  error?: { message: string; position: number; hint: string };
}

const emptyManual = (): ManualState => ({ groups: [], past: [], future: [] });

function defaultFunction(): BooleanFunction {
  return functionFromExpression(DEFAULT_EXPRESSION);
}

function initialProbabilities(fn: BooleanFunction): Record<string, number> {
  const map: Record<string, number> = {};
  fn.variables.forEach((v) => {
    map[v] = 0.5;
  });
  return map;
}

function hashStudio(): StudioKey | null {
  if (typeof window === "undefined") return null;
  return studioFromHash(window.location.hash);
}

function buildInitialState(): AppState {
  const stored = loadFromStorage();
  const fromHash = hashStudio();
  if (stored) {
    try {
      // 先用输出向量还原函数（这是唯一事实），再尝试用保存的表达式还原 AST。
      // 不还原 AST 的话，刷新后「同一函数」会显示成最简式，和输入框里的式子对不上。
      let fn = functionFromValues(stored.variables, stored.values);
      const savedText = stored.expression.trim();
      if (savedText.length > 0) {
        try {
          const minterm = tryParseMintermNotation(savedText);
          if (minterm) {
            const vars = (minterm.variables ?? stored.variables).slice(0, 6);
            fn = functionFromMinterms(vars, minterm.minterms, minterm.dontCares);
          } else {
            const parsed = functionFromExpression(savedText);
            // 只有真值一致时才采用解析结果，避免旧文件里表达式与向量不一致
            if (parsed.values.join() === stored.values.join()) fn = parsed;
          }
        } catch {
          /* 表达式不可解析时保留向量还原结果 */
        }
      }
      const probabilities: Record<string, number> = {};
      stored.variables.forEach((v, i) => {
        probabilities[v] = stored.probabilities[i] ?? 0.5;
      });
      const fallback = stored.variables.length > 0 ? `F = ${fn.expression}` : "F = 0";
      const expressionInput =
        stored.expression && stored.expression.trim().length > 0 ? stored.expression : fallback;
      return {
        studio: fromHash ?? stored.studio,
        theme: stored.theme,
        fn,
        expressionInput,
        expressionDraft: expressionInput,
        probabilities,
        manual: { groups: stored.manualGroups, past: [], future: [] },
        trials: stored.trials,
        seed: stored.seed,
        useFixedSeed: true,
        recentExpressions: stored.recentExpressions,
        notationMode: stored.notationMode,
        notationStyle: stored.notationStyle,
        toast: null,
      };
    } catch {
      /* 存储损坏则回退到默认实验 */
    }
  }
  const fn = defaultFunction();
  return {
    studio: fromHash ?? "overview",
    theme: "dark",
    fn,
    expressionInput: DEFAULT_EXPRESSION,
    expressionDraft: DEFAULT_EXPRESSION,
    probabilities: initialProbabilities(fn),
    manual: emptyManual(),
    trials: 1000,
    seed: 20260101,
    useFixedSeed: true,
    recentExpressions: [],
    notationMode: "digital",
    notationStyle: "textbook",
    toast: null,
  };
}

export interface AppActions {
  setStudio: (studio: StudioKey) => void;
  setTheme: (theme: "dark" | "light") => void;
  toggleTheme: () => void;
  setNotationMode: (mode: NotationMode) => void;
  setNotationStyle: (style: NotationStyle) => void;
  toggleNotationStyle: () => void;
  applyExpression: (raw: string, options?: { silent?: boolean }) => ApplyResult;
  setDraft: (raw: string) => void;
  setCell: (index: number, value: CellValue) => void;
  applyMinterms: (variables: string[], minterms: number[], dontCares: number[]) => ApplyResult;
  setProbability: (variable: string, value: number) => void;
  resetProbabilities: () => void;
  setTrials: (trials: number) => void;
  setSeed: (seed: number) => void;
  setUseFixedSeed: (value: boolean) => void;
  addManualGroup: (cells: number[]) => { ok: boolean; error?: string };
  removeManualGroup: (id: string) => void;
  undoManual: () => void;
  redoManual: () => void;
  clearManual: () => void;
  resetExperiment: () => void;
  importExperiment: (data: ExperimentData) => void;
  exportExperiment: () => string;
  clearAll: () => void;
  notify: (kind: Toast["kind"], text: string) => void;
  dismissToast: () => void;
}

interface AppContextValue {
  state: AppState;
  actions: AppActions;
  lastSavedAt: number | null;
  canUndo: boolean;
  canRedo: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

let toastSeq = 0;
let groupSeq = 0;

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(buildInitialState);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const notify = useCallback((kind: Toast["kind"], text: string) => {
    setState((prev) => ({ ...prev, toast: { id: (toastSeq += 1), kind, text } }));
  }, []);

  const dismissToast = useCallback(() => {
    setState((prev) => (prev.toast ? { ...prev, toast: null } : prev));
  }, []);

  const setStudio = useCallback((studio: StudioKey) => {
    setState((prev) => (prev.studio === studio ? prev : { ...prev, studio }));
  }, []);

  const setTheme = useCallback((theme: "dark" | "light") => {
    setState((prev) => ({ ...prev, theme }));
  }, []);

  const toggleTheme = useCallback(() => {
    setState((prev) => ({ ...prev, theme: prev.theme === "dark" ? "light" : "dark" }));
  }, []);

  const setNotationMode = useCallback((notationMode: NotationMode) => {
    setState((prev) => (prev.notationMode === notationMode ? prev : { ...prev, notationMode }));
  }, []);

  const setNotationStyle = useCallback((notationStyle: NotationStyle) => {
    setState((prev) => (prev.notationStyle === notationStyle ? prev : { ...prev, notationStyle }));
  }, []);

  const toggleNotationStyle = useCallback(() => {
    setState((prev) => ({
      ...prev,
      notationStyle: prev.notationStyle === "textbook" ? "compact" : "textbook",
    }));
  }, []);

  const setDraft = useCallback((raw: string) => {
    setState((prev) => ({ ...prev, expressionDraft: raw }));
  }, []);

  /** 统一的「提交新函数」入口：所有输入方式最终都走这里 */
  const commitFunction = useCallback(
    (fn: BooleanFunction, text: string, toastText: string | null) => {
      setState((prev) => {
        const probabilities = { ...prev.probabilities };
        fn.variables.forEach((v) => {
          if (probabilities[v] === undefined) probabilities[v] = 0.5;
        });
        const recent = [text, ...prev.recentExpressions.filter((r) => r !== text)].slice(0, 6);
        return {
          ...prev,
          fn,
          expressionInput: text,
          expressionDraft: text,
          probabilities,
          manual: emptyManual(),
          recentExpressions: recent,
          toast: toastText
            ? { id: (toastSeq += 1), kind: "ok" as const, text: toastText }
            : prev.toast,
        };
      });
    },
    []
  );

  const applyMinterms = useCallback(
    (variables: string[], minterms: number[], dontCares: number[]): ApplyResult => {
      try {
        const fn = functionFromMinterms(variables, minterms, dontCares);
        const text = `F = ${formatMintermNotation(minterms, dontCares)}`;
        commitFunction(
          fn,
          text,
          `已生成 ${fn.variables.length} 变量函数 · ${minterms.length} 个最小项${
            dontCares.length ? ` · ${dontCares.length} 个无关项` : ""
          }`
        );
        return { ok: true };
      } catch (error) {
        return { ok: false, error: { message: (error as Error).message, position: 0, hint: "" } };
      }
    },
    [commitFunction]
  );

  const applyExpression = useCallback(
    (raw: string, options: { silent?: boolean } = {}): ApplyResult => {
      const minterm = tryParseMintermNotation(raw);
      if (minterm) {
        const n = minterm.variables?.length ?? minterm.inferredVariables;
        const vars = (minterm.variables ?? ALL_VARIABLES.slice(0, n)).slice(0, 6);
        try {
          const fn = functionFromMinterms(vars, minterm.minterms, minterm.dontCares);
          const text = `F = ${formatMintermNotation(minterm.minterms, minterm.dontCares)}`;
          commitFunction(
            fn,
            text,
            options.silent ? null : `已识别最小项记号 · ${fn.variables.join(", ")}`
          );
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            error: { message: (error as Error).message, position: 0, hint: "" },
          };
        }
      }

      try {
        const fn = functionFromExpression(raw);
        commitFunction(
          fn,
          raw,
          options.silent
            ? null
            : `已解析 · ${fn.variables.length} 个变量 · ${fn.values.length} 行真值表`
        );
        return { ok: true };
      } catch (error) {
        if (error instanceof ExpressionError) {
          return {
            ok: false,
            error: { message: error.message, position: error.position, hint: error.hint },
          };
        }
        return { ok: false, error: { message: (error as Error).message, position: 0, hint: "" } };
      }
    },
    [commitFunction]
  );

  const setCell = useCallback((index: number, value: CellValue) => {
    setState((prev) => {
      const fn = withCellValue(prev.fn, index, value);
      return {
        ...prev,
        fn,
        expressionInput: `F = ${fn.expression}`,
        expressionDraft: `F = ${fn.expression}`,
        manual: emptyManual(),
      };
    });
  }, []);

  const setProbability = useCallback((variable: string, value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    setState((prev) => ({
      ...prev,
      probabilities: { ...prev.probabilities, [variable]: clamped },
    }));
  }, []);

  const resetProbabilities = useCallback(() => {
    setState((prev) => ({ ...prev, probabilities: initialProbabilities(prev.fn) }));
  }, []);

  const setTrials = useCallback((trials: number) => {
    setState((prev) => ({ ...prev, trials }));
  }, []);

  const setSeed = useCallback((seed: number) => {
    setState((prev) => ({ ...prev, seed: Math.floor(seed) || 1 }));
  }, []);

  const setUseFixedSeed = useCallback((value: boolean) => {
    setState((prev) => ({ ...prev, useFixedSeed: value }));
  }, []);

  const addManualGroup = useCallback((cells: number[]) => {
    const prev = stateRef.current;
    const sorted = [...cells].sort((a, b) => a - b);
    const duplicate = prev.manual.groups.some(
      (g) => g.cells.length === sorted.length && g.cells.every((c, i) => c === sorted[i])
    );
    if (duplicate) return { ok: false, error: "这个分组已经存在，无需重复添加" };
    groupSeq += 1;
    const group: ManualGroupData = { id: `g${groupSeq}`, cells: sorted };
    setState((s) => ({
      ...s,
      manual: {
        groups: [...s.manual.groups, group],
        past: [...s.manual.past, s.manual.groups].slice(-40),
        future: [],
      },
    }));
    return { ok: true };
  }, []);

  const removeManualGroup = useCallback((id: string) => {
    setState((s) => {
      if (!s.manual.groups.some((g) => g.id === id)) return s;
      return {
        ...s,
        manual: {
          groups: s.manual.groups.filter((g) => g.id !== id),
          past: [...s.manual.past, s.manual.groups].slice(-40),
          future: [],
        },
      };
    });
  }, []);

  const undoManual = useCallback(() => {
    setState((s) => {
      const { past, groups, future } = s.manual;
      if (past.length === 0) return s;
      const previous = past[past.length - 1];
      return {
        ...s,
        manual: {
          groups: previous,
          past: past.slice(0, -1),
          future: [groups, ...future].slice(0, 40),
        },
      };
    });
  }, []);

  const redoManual = useCallback(() => {
    setState((s) => {
      const { future, groups, past } = s.manual;
      if (future.length === 0) return s;
      const next = future[0];
      return {
        ...s,
        manual: { groups: next, past: [...past, groups].slice(-40), future: future.slice(1) },
      };
    });
  }, []);

  const clearManual = useCallback(() => {
    setState((s) =>
      s.manual.groups.length === 0
        ? s
        : {
            ...s,
            manual: { groups: [], past: [...s.manual.past, s.manual.groups].slice(-40), future: [] },
          }
    );
  }, []);

  const resetExperiment = useCallback(() => {
    const fn = defaultFunction();
    setState((prev) => ({
      ...prev,
      fn,
      expressionInput: DEFAULT_EXPRESSION,
      expressionDraft: DEFAULT_EXPRESSION,
      probabilities: initialProbabilities(fn),
      manual: emptyManual(),
      toast: { id: (toastSeq += 1), kind: "ok", text: `已恢复默认实验 ${DEFAULT_EXPRESSION}` },
    }));
  }, []);

  const importExperiment = useCallback((data: ExperimentData) => {
    const fn = functionFromValues(data.variables, data.values);
    const probabilities: Record<string, number> = {};
    data.variables.forEach((v, i) => {
      probabilities[v] = data.probabilities[i] ?? 0.5;
    });
    const expressionInput = data.expression || `F = ${fn.expression}`;
    setState((prev) => ({
      ...prev,
      fn,
      expressionInput,
      expressionDraft: expressionInput,
      probabilities,
      manual: { groups: data.manualGroups, past: [], future: [] },
      trials: data.trials,
      seed: data.seed,
      theme: data.theme,
      studio: data.studio,
      recentExpressions: data.recentExpressions,
      notationMode: data.notationMode,
      notationStyle: data.notationStyle,
      toast: { id: (toastSeq += 1), kind: "ok", text: "实验已导入，并通过结构校验" },
    }));
  }, []);

  const exportExperiment = useCallback(() => {
    const s = stateRef.current;
    return serializeExperiment({
      kind: "mathbridge.experiment",
      version: 1,
      savedAt: Date.now(),
      studio: s.studio,
      theme: s.theme,
      expression: s.expressionInput,
      variables: s.fn.variables,
      values: s.fn.values,
      probabilities: s.fn.variables.map((v) => s.probabilities[v] ?? 0.5),
      manualGroups: s.manual.groups,
      trials: s.trials,
      seed: s.seed,
      recentExpressions: s.recentExpressions,
      notationMode: s.notationMode,
      notationStyle: s.notationStyle,
    });
  }, []);

  const clearAll = useCallback(() => {
    clearStorage();
    const fn = defaultFunction();
    groupSeq = 0;
    setState((prev) => ({
      ...prev,
      fn,
      expressionInput: DEFAULT_EXPRESSION,
      expressionDraft: DEFAULT_EXPRESSION,
      probabilities: initialProbabilities(fn),
      manual: emptyManual(),
      recentExpressions: [],
      trials: 1000,
      seed: 20260101,
      toast: { id: (toastSeq += 1), kind: "warn", text: "本地数据已清除：表达式、概率、分组与历史" },
    }));
    setLastSavedAt(null);
  }, []);

  const payload = useMemo<ExperimentData>(
    () => ({
      kind: "mathbridge.experiment",
      version: 1,
      savedAt: Date.now(),
      studio: state.studio,
      theme: state.theme,
      expression: state.expressionInput,
      variables: state.fn.variables,
      values: state.fn.values,
      probabilities: state.fn.variables.map((v) => state.probabilities[v] ?? 0.5),
      manualGroups: state.manual.groups,
      trials: state.trials,
      seed: state.seed,
      recentExpressions: state.recentExpressions,
      notationMode: state.notationMode,
      notationStyle: state.notationStyle,
    }),
    [
      state.studio,
      state.theme,
      state.expressionInput,
      state.fn,
      state.probabilities,
      state.manual.groups,
      state.trials,
      state.seed,
      state.recentExpressions,
      state.notationMode,
      state.notationStyle,
    ]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (saveToStorage(payload)) setLastSavedAt(Date.now());
    }, 500);
    return () => window.clearTimeout(timer);
  }, [payload]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  const actions = useMemo<AppActions>(
    () => ({
      setStudio,
      setTheme,
      toggleTheme,
      setNotationMode,
      setNotationStyle,
      toggleNotationStyle,
      applyExpression,
      setDraft,
      setCell,
      applyMinterms,
      setProbability,
      resetProbabilities,
      setTrials,
      setSeed,
      setUseFixedSeed,
      addManualGroup,
      removeManualGroup,
      undoManual,
      redoManual,
      clearManual,
      resetExperiment,
      importExperiment,
      exportExperiment,
      clearAll,
      notify,
      dismissToast,
    }),
    [
      setStudio,
      setTheme,
      toggleTheme,
      setNotationMode,
      setNotationStyle,
      toggleNotationStyle,
      applyExpression,
      setDraft,
      setCell,
      applyMinterms,
      setProbability,
      resetProbabilities,
      setTrials,
      setSeed,
      setUseFixedSeed,
      addManualGroup,
      removeManualGroup,
      undoManual,
      redoManual,
      clearManual,
      resetExperiment,
      importExperiment,
      exportExperiment,
      clearAll,
      notify,
      dismissToast,
    ]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      actions,
      lastSavedAt,
      canUndo: state.manual.past.length > 0,
      canRedo: state.manual.future.length > 0,
    }),
    [state, actions, lastSavedAt]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp 必须在 AppProvider 内使用");
  return ctx;
}

/** 便捷：把 probabilities 记录转成按变量顺序的数组 */
export function probabilityArray(variables: string[], map: Record<string, number>): number[] {
  return variables.map((v) => map[v] ?? 0.5);
}
