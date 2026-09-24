/**
 * 阅读时长估算 —— 构建期从正文自动算，文章改了时长跟着变，不用手维护。
 *
 * 口径（按中文数学科普长文的实际读感定，只求量级对，不做精确承诺）：
 *   中文 380 字/分钟（常速 300–500 的中位偏慢，数学文要回看）；英文/数字按 220 词/分钟
 *   行内公式 +1 秒（扫一眼就过）；块级公式 +6 秒（要停下来看结构）
 *   每个活图实例 +15 秒（交互图读者会拖着玩）
 * 结果四舍五入到「约 N 分钟」，最少 1。需要精修时在 frontmatter 写 readingTime 覆盖。
 */

/** 中日韩统一表意文字（含扩展 A 与兼容区） */
const CJK_CHAR = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
const CJK_ALL = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g

export interface ReadingStats {
  /** 估算分钟数（≥1），用于展示 */
  minutes: number
  /** 中文字符数（用于核对口径，不进页面） */
  cjk: number
  /** 英文/数字词数 */
  words: number
  /** 行内公式个数 */
  inlineFormulas: number
  /** 块级公式个数 */
  displayFormulas: number
  /** GroupScene 活图实例个数 */
  figures: number
}

/**
 * @param raw 文章正文原文（MDX/MD 源码，不含 frontmatter）
 */
export function estimateReading(raw: string): ReadingStats {
  let s = raw ?? ''

  // 代码块与行内代码不计入阅读量
  s = s.replace(/```[\s\S]*?```/g, ' ')
  s = s.replace(/`[^`\n]*`/g, ' ')

  // 公式：必须在剥标签之前处理——TeX 里带 `\left<` 之类字符会干扰标签正则
  let displayFormulas = 0
  let inlineFormulas = 0
  s = s.replace(/\$\$[\s\S]*?\$\$/g, () => (displayFormulas++, ' '))
  s = s.replace(/\$[^$\n]+?\$/g, () => (inlineFormulas++, ' '))

  // 活图实例：读者会拖一拖，单独计时
  let figures = 0
  s = s.replace(/<GroupScene\b/g, () => (figures++, ' '))

  // import 语句与 JSX/HTML 标签
  s = s.replace(/^import\s.*$/gm, ' ')
  s = s.replace(/<[^>]*>/g, ' ')

  // Markdown 链接/图片：保留链接文字，丢掉地址
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  // 残留的行首记号（#, >, -, *, |, 表格分隔线等）
  s = s.replace(/^[\s>*\-+|:]+/gm, ' ')
  s = s.replace(/[*_~`#]/g, ' ')

  const cjk = (s.match(CJK_ALL) ?? []).length
  const words = (s.replace(CJK_ALL, ' ').match(/[A-Za-z][A-Za-z'’-]*/g) ?? []).length

  const seconds =
    cjk / (380 / 60) +
    words / (220 / 60) +
    inlineFormulas * 1 +
    displayFormulas * 6 +
    figures * 15

  return {
    minutes: Math.max(1, Math.round(seconds / 60)),
    cjk,
    words,
    inlineFormulas,
    displayFormulas,
    figures,
  }
}

/** 供列表页等场景做「有无中文正文」判断 */
export function hasCjk(s: string): boolean {
  return CJK_CHAR.test(s)
}
