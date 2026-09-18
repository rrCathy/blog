/**
 * 站内搜索索引（构建期生成，见 src/pages/search-index.json.ts）。
 *
 * 索引字段与客户端 fuse.js 的 key 权重一一对应（src/components/SearchBox.tsx）：
 *   title(3) > tags(2.5) > description(2) > body(1)
 *
 * 正文来源：Astro 6 的 content loader API 下 entry.body 不再暴露，
 * 这里直接读 src/content/blog/<id>.{mdx,md} 原文，做一层 markdown 剥离：
 *   - frontmatter、import 语句、围栏/内联代码、图片、HTML/MDX 标签、
 *     JSX 表达式与注释、markdown 标记全部剥掉
 *   - KaTeX 公式的 $ 定界符剥掉，公式字母会残留——对中文检索无影响，可接受
 *   - 截前 1600 字符：搜索要的是「能命中」，不是全文备份
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getCollection, type CollectionEntry } from 'astro:content'

export interface SearchIndexEntry {
  id: string
  title: string
  description: string
  tags: string[]
  /** YYYY-MM-DD */
  pubDate: string
  /** 含 base 前缀的站内绝对路径（如 /blog/260910_cayley-graph/） */
  url: string
  /** 剥离后的正文纯文本（截断到 1600 字符） */
  body: string
}

const BODY_LIMIT = 1600

export function stripMarkdown(md: string): string {
  return md
    .replace(/^---\r?\n[\s\S]*?\r?\n---/, ' ') // frontmatter（仅文件头部）
    .replace(/^import\s.*$/gm, ' ') // MDX import 行
    .replace(/^export\s.*$/gm, ' ') // MDX export 行
    .replace(/```[\s\S]*?```/g, ' ') // 围栏代码块
    .replace(/`[^`\n]*`/g, ' ') // 内联代码
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ') // JSX 块注释
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 图片 → 丢弃
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // 链接 → 留文字
    .replace(/<[^>]+>/g, ' ') // HTML/MDX 标签（[^>] 可跨行）
    .replace(/\{[^{}\n]*\}/g, ' ') // 单行 JSX 表达式
    .replace(/[#*_>~|$\\]+/g, ' ') // markdown 标记与公式定界符
    .replace(/\s+/g, ' ')
    .trim()
}

function readPostBody(post: CollectionEntry<'blog'>): string {
  const blogDir = resolve(process.cwd(), 'src/content/blog')
  for (const ext of ['mdx', 'md']) {
    const file = resolve(blogDir, `${post.id}.${ext}`)
    if (existsSync(file)) {
      try {
        return readFileSync(file, 'utf-8')
      } catch {
        return ''
      }
    }
  }
  return ''
}

/**
 * 构建搜索索引条目（构建期调用，draft 文章不进索引——与列表/RSS 口径一致）。
 * @param base BASE_URL，如 '/blog/'（保证索引里的 url 与部署路径一致）
 */
export async function buildSearchIndex(base: string): Promise<SearchIndexEntry[]> {
  const posts = (await getCollection('blog'))
    .filter((p) => !p.data.draft)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())

  const prefix = base.endsWith('/') ? base : base + '/'
  return posts.map((post) => {
    const raw = readPostBody(post)
    const body = stripMarkdown(raw).slice(0, BODY_LIMIT)
    return {
      id: post.id,
      title: post.data.title,
      description: post.data.description ?? '',
      tags: post.data.tags,
      pubDate: post.data.pubDate.toISOString().slice(0, 10),
      url: prefix + post.id + '/',
      body,
    }
  })
}