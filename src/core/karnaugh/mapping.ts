import { bitsToLabel, grayCodeSequence, toBits } from "./grayCode";

/**
 * 卡诺图布局映射
 *
 * 变量切分规则（遵循教科书惯例）：
 *   1 变量：行 A                 → 2×1
 *   2 变量：行 A | 列 B           → 2×2
 *   3 变量：行 A | 列 B,C         → 2×4
 *   4 变量：行 A,B | 列 C,D       → 4×4
 *   5 变量：两页 4×4（E=0 / E=1）
 *   6 变量：四页 4×4（EF = 00 / 01 / 11 / 10，格雷顺序）
 *
 * 多出来的变量不铺在纸面上，而是叠成「平面」：同一位置、相邻平面的两格
 * 只差一个变量位，所以它们也是相邻的。平面顺序同样必须用格雷码，
 * 否则「叠在一起就算相邻」会不成立。
 *
 * minterm 编号公式：
 *   minterm = 平面值 << (行位 + 列位) | 行值 << 列位 | 列值
 */

export interface AxisEntry {
  /** 该位置对应的变量取值对应的二进制数（也就是格雷码元素本身） */
  value: number;
  bits: Array<0 | 1>;
  label: string;
}

export interface KMapPlane {
  /** 平面在格雷序列中的下标 */
  index: number;
  /** 平面固定变量的取值（打包成整数） */
  value: number;
  bits: Array<0 | 1>;
  /** 如 "E=0" 或 "E=0　F=1" */
  label: string;
  /** cells[row][col] = minterm 编号 */
  cells: number[][];
}

export interface KMapLayout {
  variables: string[];
  rowVariables: string[];
  colVariables: string[];
  /** 决定平面的变量（0–2 个），如 [E] 或 [E, F] */
  planeVariables: string[];
  rows: AxisEntry[];
  cols: AxisEntry[];
  planes: KMapPlane[];
  /** 第一页的格子。多平面时请遍历 planes，这里仅为兼容旧调用 */
  cells: number[][];
  rowBits: number;
  colBits: number;
  planeBits: number;
}

export function splitVariables(variables: string[]): {
  row: string[];
  col: string[];
  plane: string[];
} {
  const n = variables.length;
  if (n <= 1) return { row: [...variables], col: [], plane: [] };
  if (n === 2) return { row: [variables[0]], col: [variables[1]], plane: [] };
  if (n === 3) return { row: [variables[0]], col: [variables[1], variables[2]], plane: [] };
  return {
    row: variables.slice(0, 2),
    col: variables.slice(2, 4),
    plane: variables.slice(4),
  };
}

function axisEntries(bits: number): AxisEntry[] {
  return grayCodeSequence(bits).map((value) => {
    const bitArray = toBits(value, bits);
    return { value, bits: bitArray, label: bitsToLabel(bitArray) };
  });
}

export function buildKMapLayout(variables: string[]): KMapLayout {
  const { row: rowVariables, col: colVariables, plane: planeVariables } = splitVariables(variables);
  const rowBits = rowVariables.length;
  const colBits = colVariables.length;
  const planeBits = planeVariables.length;

  const rows = axisEntries(rowBits);
  const cols = axisEntries(colBits);

  const planes: KMapPlane[] = grayCodeSequence(planeBits).map((value, index) => {
    const bits = toBits(value, planeBits);
    const cells = rows.map((row) =>
      cols.map(
        (col) =>
          (row.value << (colBits + planeBits)) | (col.value << planeBits) | value
      )
    );
    return {
      index,
      value,
      bits,
      label: planeVariables.map((variable, i) => `${variable}=${bits[i]}`).join("　"),
      cells,
    };
  });

  return {
    variables,
    rowVariables,
    colVariables,
    planeVariables,
    rows,
    cols,
    planes,
    cells: planes[0].cells,
    rowBits,
    colBits,
    planeBits,
  };
}

/** 由 minterm 编号反查它在卡诺图中的平面与行列位置 */
export function locateMinterm(
  layout: KMapLayout,
  minterm: number
): { plane: number; row: number; col: number } | null {
  for (const plane of layout.planes) {
    for (let r = 0; r < layout.rows.length; r += 1) {
      for (let c = 0; c < layout.cols.length; c += 1) {
        if (plane.cells[r][c] === minterm) return { plane: plane.index, row: r, col: c };
      }
    }
  }
  return null;
}

/** 某个格子的变量取值描述，例如 "A=1, B=0, C=1" */
export function cellAssignment(layout: KMapLayout, minterm: number): string {
  const n = layout.variables.length;
  const bits = toBits(minterm, n);
  return layout.variables.map((v, i) => `${v}=${bits[i]}`).join(", ");
}

export interface KMapPoint {
  plane?: number;
  row: number;
  col: number;
}

/**
 * 卡诺图的「可视相邻」关系：
 *   · 同一页内上下左右相邻（含四边环绕）
 *   · 同一位置、相邻平面（平面按格雷码排列，含首尾环绕）
 * 该判据与「minterm 只差一位」等价，测试中会交叉验证。
 */
export function visuallyAdjacent(layout: KMapLayout, a: KMapPoint, b: KMapPoint): boolean {
  const cyclicNeighbor = (x: number, y: number, len: number): boolean =>
    len >= 2 && ((x + 1) % len === y || (y + 1) % len === x);

  const pa = a.plane ?? 0;
  const pb = b.plane ?? 0;

  if (pa === pb) {
    if (a.row === b.row && a.col === b.col) return false;
    if (a.row === b.row) return cyclicNeighbor(a.col, b.col, layout.cols.length);
    if (a.col === b.col) return cyclicNeighbor(a.row, b.row, layout.rows.length);
    return false;
  }

  // 跨平面：位置必须相同，且两页在格雷序列上相邻
  if (a.row !== b.row || a.col !== b.col) return false;
  return cyclicNeighbor(pa, pb, layout.planes.length);
}
