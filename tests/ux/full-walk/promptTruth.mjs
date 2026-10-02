// 「所见即所发」里提示词那一半的判据（监视器铁律 3 用；单独成文件、零依赖，好单测）。
//
// 用户点头那一刻，他在**确认界面**上看到了一句提示词（shown）和整屏的字（surfaceText）。
// 供应商真正收到的提示词（sentRaw）必须是：他看到的那句原样 + 至多若干行「他在同一个界面上看得见的字」。
// 多出来又不在那个界面文字里的行 = 看不见的替换 / 追加，返回给调用方记违反。
//
// 边界（刻意的）：
//   · 没给 surfaceText（这个入口读不到「界面上有什么」）→ 不判，返回空。宁可漏判一个入口，也不在读不到的地方乱红；
//   · 换行是段落边界，按行比：不把整段压成一行再找子串（那样「巨龙」这个子串永远在「巨龙……林薇……」里）；
//   · 每行内部的空白压成一格再比（编辑器渲染的换行 / 空格数量不是用户写的字）。
const lineOf = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

export function unseenPromptAdditions({ shown, sentRaw, surfaceText }) {
  if (typeof surfaceText !== 'string' || !lineOf(shown)) return []
  const shownLines = new Set(String(shown).split('\n').map(lineOf).filter(Boolean))
  const surface = lineOf(surfaceText)
  return String(sentRaw ?? '').split('\n').map(lineOf).filter(Boolean)
    .filter((line) => !shownLines.has(line) && !surface.includes(line))
}
