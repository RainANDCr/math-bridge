/**
 * 格雷码
 *
 * 卡诺图的本质：把「相邻」这个几何概念与「只差一个变量」这个逻辑概念对齐。
 * 为此行列编号必须按格雷码排列，否则跨边界的 2 格分组就会画不出来。
 */

/** 第 i 个二进制数对应的格雷码 */
export function binaryToGray(value: number): number {
  return value ^ (value >>> 1);
}

/** 格雷码还原为二进制 */
export function grayToBinary(gray: number): number {
  let value = gray;
  let shift = 1;
  while (value >>> shift) {
    value ^= value >>> shift;
    shift <<= 1;
  }
  return value;
}

/**
 * 长度为 2^bits 的格雷码序列（元素是「变量取值」本身）。
 * bits=2 → [0, 1, 3, 2] → 00, 01, 11, 10
 */
export function grayCodeSequence(bits: number): number[] {
  if (bits <= 0) return [0];
  const total = 1 << bits;
  const out: number[] = new Array(total);
  for (let i = 0; i < total; i += 1) out[i] = binaryToGray(i);
  return out;
}

/** 数字转固定宽度位数组，高位在左 */
export function toBits(value: number, width: number): Array<0 | 1> {
  const bits: Array<0 | 1> = new Array(width);
  for (let i = 0; i < width; i += 1) {
    bits[i] = ((value >> (width - 1 - i)) & 1) === 1 ? 1 : 0;
  }
  return bits;
}

/** 位数组转数字，高位在左 */
export function fromBits(bits: Array<0 | 1>): number {
  return bits.reduce<number>((acc, bit) => (acc << 1) | bit, 0);
}

export function bitsToLabel(bits: Array<0 | 1>): string {
  return bits.join("");
}

/** 相邻：两者只差一个二进制位（卡诺图中的上下左右 + 四边环绕） */
export function isAdjacent(a: number, b: number): boolean {
  const diff = a ^ b;
  return diff !== 0 && (diff & (diff - 1)) === 0;
}
