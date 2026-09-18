import { getCollection, type CollectionEntry } from 'astro:content'

export type TaggedPost = CollectionEntry<'blog'>

export interface TagInfo {
  /** 标签原文（如 '群论'、'前端'） */
  name: string
  /** URL 段（encodeURIComponent 后的 name，全角字符也安全） */
  slug: string
  /** 该标签下的文章数 */
  count: number
}

export interface TaggedGroup {
  tag: TagInfo
  /** 该标签下的文章，按发布日期倒序 */
  posts: TaggedPost[]
}

/**
 * 聚合所有标签（构建期调用）。
 *
 * - 只收已发布文章：draft: true 不进标签页（与列表、RSS 口径一致）
 * - slug 与原文双向无损可逆：直接 encodeURIComponent 即可，
 *   中文/特殊字符在路径段合法，不需要 ASCII slug 化
 * - 返回值按文章数倒序、篇数相同时按首篇文章日期倒序——热门标签在前
 */
export async function getAllTags(): Promise<TaggedGroup[]> {
  const posts = (await getCollection('blog'))
    .filter((p) => !p.data.draft)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())

  const byName = new Map<string, TaggedGroup>()
  for (const post of posts) {
    for (const name of post.data.tags) {
      const slug = encodeURIComponent(name)
      const found = byName.get(name)
      if (!found) {
        byName.set(name, { tag: { name, slug, count: 1 }, posts: [post] })
        continue
      }
      found.tag.count++
      found.posts.push(post)
    }
  }

  const list = [...byName.values()]
  // 篇数倒序；同篇数按最新文章日期倒序（热门且新鲜的在前）
  list.sort((a, b) => {
    const dc = b.tag.count - a.tag.count
    if (dc !== 0) return dc
    return a.posts[0].data.pubDate.valueOf() - b.posts[0].data.pubDate.valueOf()
  })
  return list
}

/**
 * 给定原始标签名，返回对应的 TagInfo（不在集合中返回 null）。
 * 用法：[tag].astro 的 getStaticPaths 里把 params.name 还原回原标签名。
 */
export function findTagBySlug(slug: string, groups: TaggedGroup[]): TagInfo | null {
  for (const g of groups) {
    if (g.tag.slug === slug) return g.tag
  }
  return null
}