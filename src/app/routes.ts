import {
  Binary,
  BookOpen,
  Dice5,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  Layers3,
  GitBranch,
  CircuitBoard,
  Sigma,
  type LucideIcon,
} from "lucide-react";
import type { StudioKey } from "../store/persistence";

export interface RouteMeta {
  key: StudioKey;
  index: string;
  zh: string;
  /** 移动端底栏使用的短标签 */
  short: string;
  en: string;
  desc: string;
  icon: LucideIcon;
}

export const ROUTES: RouteMeta[] = [
  {
    key: "overview",
    index: "00",
    zh: "总览",
    short: "总览",
    en: "Overview",
    desc: "实验控制台与最近工作",
    icon: LayoutDashboard,
  },
  {
    key: "logic",
    index: "01",
    zh: "逻辑工作台",
    short: "逻辑",
    en: "Logic Studio",
    desc: "表达式、真值表与逻辑门",
    icon: Binary,
  },
  {
    key: "notation",
    index: "02",
    zh: "符号百科",
    short: "符号",
    en: "Notation",
    desc: "跨学科符号与逻辑门符号",
    icon: Sigma,
  },
  {
    key: "karnaugh",
    index: "03",
    zh: "卡诺图工作室",
    short: "卡诺",
    en: "Karnaugh Studio",
    desc: "格雷码图形化简与等价验证",
    icon: LayoutGrid,
  },
  {
    key: "multi",
    index: "04",
    zh: "多输出化简",
    short: "多输出",
    en: "Multi-Output",
    desc: "共享乘积项，降低总门数",
    icon: Layers3,
  },
  {
    key: "sequential",
    index: "05",
    zh: "时序逻辑",
    short: "时序",
    en: "Sequential Logic",
    desc: "状态转移与次态方程",
    icon: GitBranch,
  },
  {
    key: "gate",
    index: "06",
    zh: "门级搭建",
    short: "门级",
    en: "Gate Lab",
    desc: "拖门连线，反推表达式",
    icon: CircuitBoard,
  },
  {
    key: "probability",
    index: "07",
    zh: "概率实验室",
    short: "概率",
    en: "Probability Studio",
    desc: "理论概率与蒙特卡洛模拟",
    icon: Dice5,
  },
  {
    key: "connection",
    index: "08",
    zh: "知识连接",
    short: "连接",
    en: "Connection Lab",
    desc: "同一数学对象的多重视角",
    icon: Link2,
  },
  {
    key: "reference",
    index: "09",
    zh: "概念速查",
    short: "速查",
    en: "Reference",
    desc: "术语、运算规则与常见误区",
    icon: BookOpen,
  },
];

export function routeOf(key: StudioKey): RouteMeta {
  return ROUTES.find((r) => r.key === key) ?? ROUTES[0];
}

export const STUDIO_HASH: Record<StudioKey, string> = {
  overview: "#/overview",
  logic: "#/logic",
  notation: "#/notation",
  karnaugh: "#/karnaugh",
  multi: "#/multi",
  sequential: "#/sequential",
  gate: "#/gate",
  probability: "#/probability",
  connection: "#/connection",
  reference: "#/reference",
};

export function studioFromHash(hash: string): StudioKey | null {
  const clean = hash.replace(/^#\/?/, "").trim();
  const found = ROUTES.find((r) => r.key === clean);
  return found ? found.key : null;
}
