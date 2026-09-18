/**
 * RSS 全文回填（astro build 之后跑，见 package.json 的 build script）。
 *
 * 原理：文章页构建时已渲染成完整 HTML（dist/<id>/index.html），与 RSS 想要的
 * 内容是同一条渲染管线。本脚本从 rss.xml 的每个 <item> 里取 link，找到对应的
 * dist 页面，抠出 <div class="article-body"> 正文，剥掉交互组件与脚本后，
 * XML 转义塞进 <content:encoded>，同时给 <rss> 根元素补 xmlns:content。
 *
 * 剥离范围：
 * - <script>…</script>      脚本（astro-island 的 props JSON、hydrator）阅读器用不上
 * - <astro-island>…</…>    交互活图（GroupScene）在阅读器里跑不起来，整块剥掉留空
 * - <style>…</style>        块级样式（KaTeX 用内联样式，不受影响）
 *
 * XML 转义：& < > 三件套；正文里的 ]]> 防御性拆开（虽然走转义不走 CDATA，
 * 这里转义后不会出现裸 ]]>，留着规则以备阅读器兼容性调试）。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const distDir = resolve(process.cwd(), 'dist')
const rssPath = resolve(distDir, 'rss.xml')

if (!existsSync(rssPath)) {
  console.error('[fill-rss] dist/rss.xml 不存在——先跑 astro build')
  process.exit(1)
}

let xml = readFileSync(rssPath, 'utf-8')

/** 从整页 HTML 里按 <div 配对扫描抠出 article-body 内容 */
function extractArticleBody(html) {
  const marker = '<div class="article-body"'
  const start = html.indexOf(marker)
  if (start < 0) return null
  const contentStart = html.indexOf('>', start) + 1
  const tokenRe = /<\/?div\b/g
  tokenRe.lastIndex = contentStart
  let depth = 1
  let m
  while ((m = tokenRe.exec(html))) {
    if (m[0] === '</div') {
      depth--
      if (depth === 0) return html.slice(contentStart, m.index)
    } else {
      depth++
    }
  }
  return null
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

let filled = 0
let missed = 0

xml = xml.replace(/<item>([\s\S]*?)<\/item>/g, (item, inner) => {
  const linkMatch = inner.match(/<link>([^<]+)<\/link>/)
  if (!linkMatch) return item
  // link 形如 https://rrcathy.github.io/blog/260910_cayley-graph/
  const idMatch = linkMatch[1].match(/\/blog\/([^/]+)\/?$/)
  if (!idMatch) return item
  const id = idMatch[1]
  const pagePath = resolve(distDir, id, 'index.html')
  if (!existsSync(pagePath)) {
    console.warn(`[fill-rss] 找不到页面，跳过：${id}`)
    missed++
    return item
  }
  const page = readFileSync(pagePath, 'utf-8')
  let body = extractArticleBody(page)
  if (!body) {
    console.warn(`[fill-rss] 页面里没有 article-body，跳过：${id}`)
    missed++
    return item
  }
  body = body
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<astro-island[\s\S]*?<\/astro-island>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/\]\]>/g, ']]&gt;')
  filled++
  return item.replace(
    /(<description>[\s\S]*?<\/description>)/,
    `$1<content:encoded>${escapeXml(body)}</content:encoded>`,
  )
})

// 根元素补 xmlns:content（item 无 content 时 @astrojs/rss 不写这个命名空间）
if (!xml.includes('xmlns:content=')) {
  xml = xml.replace(
    /<rss([^>]*?)>/,
    '<rss$1 xmlns:content="http://purl.org/rss/1.0/modules/content/">',
  )
}

writeFileSync(rssPath, xml)
console.log(`[fill-rss] 完成：${filled} 篇回填全文，${missed} 篇跳过`)
