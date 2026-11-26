import type { KMapLayout } from "./mapping";

/**
 * 分组轮廓追踪
 *
 * 卡诺图的分组不是简单的一个矩形：
 *   · 跨左右边界的组会分裂成两段
 *   · 四角组会分裂成四个小块
 *   · 重叠组必须彼此可区分
 *
 * 做法：把「组内格子」的四条边中，邻居不在组内的那些边收集起来，
 * 按方向首尾相接成若干个闭合环。每个环是一条 `<path>`，
 * 既能统一填充（避免逐格出现接缝），也能统一描边（避免拐角断线）。
 *
 * 边的方向约定：沿边前进时，组内区域始终在右手边。
 */

export interface GridGeometry {
  cellW: number;
  cellH: number;
  originX: number;
  originY: number;
}

/** 单页网格：多平面卡诺图按页分别追踪轮廓 */
export interface OutlineGrid {
  rows: number;
  cols: number;
  cells: number[][];
}

interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  used: boolean;
}

const key = (x: number, y: number): string => `${x},${y}`;

export function traceGroupOutline(
  memberCells: number[],
  layout: KMapLayout,
  geom: GridGeometry
): string[] {
  return traceGridOutline(
    memberCells,
    { rows: layout.rows.length, cols: layout.cols.length, cells: layout.cells },
    geom
  );
}

/**
 * 追踪某一页上的分组轮廓。
 * 跨页的分组会在每页各画一段：教材上两张 4×4 图并排时也是这么画的，
 * 不会把两张图之间的「连接」画出来（那只会更乱）。
 */
export function tracePlaneOutline(
  memberCells: number[],
  layout: KMapLayout,
  planeIndex: number,
  geom: GridGeometry
): string[] {
  const plane = layout.planes[planeIndex];
  if (!plane) return [];
  return traceGridOutline(
    memberCells,
    { rows: layout.rows.length, cols: layout.cols.length, cells: plane.cells },
    geom
  );
}

export function traceGridOutline(
  memberCells: number[],
  grid: OutlineGrid,
  geom: GridGeometry
): string[] {
  const member = new Set(memberCells);
  const rows = grid.rows;
  const cols = grid.cols;
  const { cellW, cellH, originX, originY } = geom;

  const isMember = (r: number, c: number): boolean => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
    return member.has(grid.cells[r][c]);
  };

  const edges: Edge[] = [];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (!isMember(r, c)) continue;
      const x0 = originX + c * cellW;
      const y0 = originY + r * cellH;
      const x1 = x0 + cellW;
      const y1 = y0 + cellH;

      // 上边：左 → 右
      if (!isMember(r - 1, c)) edges.push({ x1: x0, y1: y0, x2: x1, y2: y0, used: false });
      // 右边：上 → 下
      if (!isMember(r, c + 1)) edges.push({ x1: x1, y1: y0, x2: x1, y2: y1, used: false });
      // 下边：右 → 左
      if (!isMember(r + 1, c)) edges.push({ x1: x1, y1: y1, x2: x0, y2: y1, used: false });
      // 左边：下 → 上
      if (!isMember(r, c - 1)) edges.push({ x1: x0, y1: y1, x2: x0, y2: y0, used: false });
    }
  }

  // 同一个起点可能有多条边（格子的凹角），用数组保存
  const outgoing = new Map<string, Edge[]>();
  for (const edge of edges) {
    const list = outgoing.get(key(edge.x1, edge.y1)) ?? [];
    list.push(edge);
    outgoing.set(key(edge.x1, edge.y1), list);
  }

  const paths: string[] = [];
  const maxSteps = edges.length + 2;

  for (const start of edges) {
    if (start.used) continue;
    start.used = true;
    const points: string[] = [`M ${start.x1} ${start.y1}`];
    let cx = start.x2;
    let cy = start.y2;
    let steps = 0;

    while (!(cx === start.x1 && cy === start.y1) && steps < maxSteps) {
      const candidates = (outgoing.get(key(cx, cy)) ?? []).filter((e) => !e.used);
      if (candidates.length === 0) break;
      const next = candidates[0];
      next.used = true;
      points.push(`L ${cx} ${cy}`);
      cx = next.x2;
      cy = next.y2;
      steps += 1;
    }

    if (cx === start.x1 && cy === start.y1) {
      points.push("Z");
    } else {
      // 未能闭合（理论上不会发生）：退化成一条开放折线
      points.push(`L ${cx} ${cy}`);
    }
    paths.push(points.join(" "));
  }

  return paths;
}
