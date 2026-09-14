/**
 * 标签配色：标签名 → 固定色调（tone）。
 *
 * 取色来源是 GroupViz 引擎的调色板（`@groupviz/react/theme.css` 的 `--accent-*`），
 * 目的是让页面上的分类颜色和插图里的颜色是同一套语言，而不是两套各管各的。
 *
 * 注意文字色不直接用引擎原值——那些色是给深色画布上的图形用的，拿来当正文小字
 * 偏浅（浅色主题下尤其不可读）。两套主题各自在 `global.css` 里定义
 * `--tag-<tone>-ink` / `--tag-<tone>-bg`，这里只负责点名用哪一支。
 */

const TONE_BY_TAG: Record<string, string> = {
  群论: 'teal',
  几何: 'amber',
  算法: 'indigo',
  前端: 'blue',
  架构: 'purple',
}

const TONES = ['teal', 'amber', 'indigo', 'blue', 'purple', 'coral']

/** 未登记的标签按名字散列到一支色调，保证同一标签全站同色、且与已登记的不冲突 */
export function tagTone(name: string): string {
  const known = TONE_BY_TAG[name]
  if (known) return known
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return TONES[h % TONES.length]
}
