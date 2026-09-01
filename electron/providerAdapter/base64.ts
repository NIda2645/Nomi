// Stack-safe canonical base64 syntax validation.
//
// 为什么单独成一个共享边界（2026-09-01 根因修复）：
// 认证媒体路径此前用 `^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$`
// 校验整段 base64。V8 的 Irregexp 会把「定长组再套 `*`」编成**递归回溯**结构——外层
// `*` 每迭代一次压一帧原生栈。一段几 MB 的 `data:` URL（b64_json 视频 / 3D）base64 后
// 有上百万个 4 字符组，回溯栈直接爆，抛出对用户不可读的 "Maximum call stack size exceeded"，
// 模型自认证被当成失败、卡在 enabled:false。~21KB 正常、3.4MB 必炸就是这个尺寸驱动的栈爆。
//
// 类根因不是「那一行正则」，而是「对整段载荷做 base64 语法校验时用了会按长度递归的正则」。
// 修在这里：任何认证/边界层要判「这是不是规范 base64」都调这个**扁平线性扫描**的实现
// （字符类循环 + 尾部 padding 算术，绝无按长度递归），别再各自手搓递归正则。
// 语义与原正则逐字符等价（200k 随机串 + 边界用例已对拍），只是把栈递归换成 O(n) 循环。

const CHAR_PLUS = 0x2b; // '+'
const CHAR_SLASH = 0x2f; // '/'
const CHAR_EQUALS = 0x3d; // '='

function isBase64AlphabetCode(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a) // A-Z
    || (code >= 0x61 && code <= 0x7a) // a-z
    || (code >= 0x30 && code <= 0x39) // 0-9
    || code === CHAR_PLUS
    || code === CHAR_SLASH;
}

/**
 * True iff `encoded` is a canonical, standard-alphabet base64 body:
 * length is a multiple of 4, every non-padding character is in `[A-Za-z0-9+/]`,
 * and `=` padding appears only as the final one or two characters. Equivalent to
 * `^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$` but validated
 * with a linear scan so multi-megabyte payloads never overflow the regex stack.
 * The empty string is canonical (matches the original pattern) — callers that also
 * require non-empty bytes enforce that separately after decoding.
 */
export function isCanonicalBase64Body(encoded: string): boolean {
  const length = encoded.length;
  if (length % 4 !== 0) return false;
  let padding = 0;
  if (length >= 1 && encoded.charCodeAt(length - 1) === CHAR_EQUALS) {
    padding = length >= 2 && encoded.charCodeAt(length - 2) === CHAR_EQUALS ? 2 : 1;
  }
  const bodyEnd = length - padding;
  for (let index = 0; index < bodyEnd; index += 1) {
    // A stray '=' before the trailing padding is not in the alphabet, so it is rejected here too.
    if (!isBase64AlphabetCode(encoded.charCodeAt(index))) return false;
  }
  return true;
}
