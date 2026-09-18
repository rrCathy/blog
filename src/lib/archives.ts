import { getCollection, type CollectionEntry } from 'astro:content'

export type ArchivePost = CollectionEntry<'blog'>

export interface ArchiveYear {
  /** 年份（如 2026） */
  year: number
  /** 该年文章数 */
  count: number
  /** 该年文章，按发布日期倒序 */
  posts: ArchivePost[]
}

/**
 * 按年聚合（构建期调用）。
 *
 * - 只收已发布文章：draft: true 不进归档页（与列表、RSS 口径一致）
 * - 年份倒序（最新在前）；年内再倒序（年内最新在前）
 * - 输出顺序天然按年倒序，无需再排
 */
export async function getAllArchives(): Promise<ArchiveYear[]> {
  const posts = (await getCollection('blog'))
    .filter((p) => !p.data.draft)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())

  const byYear = new Map<number, ArchiveYear>()
  for (const post of posts) {
    const y = post.data.pubDate.getFullYear()
    const found = byYear.get(y)
    if (!found) {
      byYear.set(y, { year: y, count: 1, posts: [post] })
      continue
    }
    found.count++
    found.posts.push(post)
  }

  const list = [...byYear.values()]
  // Map 按插入顺序保留，年份倒序已由 posts 倒序遍历保证；防御性再排一次
  list.sort((a, b) => b.year - a.year)
  return list
}