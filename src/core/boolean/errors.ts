/**
 * 表达式错误 —— 必须携带出错位置，UI 才能准确指给用户看。
 */
export class ExpressionError extends Error {
  readonly position: number;
  readonly length: number;
  readonly hint: string;

  constructor(message: string, position: number, hint = "", length = 1) {
    super(message);
    this.name = "ExpressionError";
    this.position = position;
    this.length = length;
    this.hint = hint;
  }
}

/**
 * 把内部位置（0 基）转成人类可读的「第 n 个字符」。
 */
export function describePosition(source: string, position: number): string {
  const clamped = Math.max(0, Math.min(position, source.length));
  return `第 ${clamped + 1} 个字符`;
}
