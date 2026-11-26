export interface Example {
  expr: string;
  goal: string;
}

/**
 * 首页「示例实验」
 *
 * 放在单独文件里而不是组件内部：它是要被测试直接检查的**文案数据**——
 * 这里一旦写回 `& | !` 那套 C 风格记号，就等于在教用户错的写法。
 */
export const EXAMPLES: Example[] = [
  { expr: "F = A·B", goal: "最小的“与”：只有在 A、B 同时为 1 的那一行，输出才为 1。" },
  { expr: "F = A + B", goal: "“或”覆盖三个最小项，卡诺图上会合并成一个 2 格 + 1 格的分组。" },
  { expr: "F = A·B + C", goal: "化简的典型：4 项的 C 加 1 个补丁 A·B，就从 5 个最小项压到 2 项。" },
  { expr: "F = A·B′ + A′·B", goal: "这是异或：两项都无法再合并，说明它已经是“本质复杂”的。" },
  { expr: "F = A·B + A·B′", goal: "看起来有两项，其实等于 A —— 吸收律的直观证据。" },
];
