import { getCollection, type CollectionEntry } from 'astro:content'

export type SeriesPost = CollectionEntry<'blog'>

export interface SeriesInfo {
  /** 系列显示名（frontmatter 的 series 字段） */
  name: string
  /** 系列页 URL 段（seriesSlug，缺省用系列名） */
  slug: string
  /** 系列成员，按发布日期升序 */
  posts: SeriesPost[]
}

/**
 * 聚合所有系列（构建期调用）。
 *
 * - 只收已发布文章：draft: true 不进系列（与列表、RSS 口径一致）
 * - 组内按 pubDate 升序：系列通常按发表顺序读，读者顺着读下来
 * - 同一系列名的 seriesSlug 必须一致 → 不一致直接报错，否则一个系列会裂成两个页面
 */
export async function getAllSeries(): Promise<SeriesInfo[]> {
  const posts = (await getCollection('blog')).filter((p) => !p.data.draft && p.data.series)

  const byName = new Map<string, SeriesInfo>()
  for (const post of posts) {
    const name = post.data.series as string
    const slug = post.data.seriesSlug ?? name
    const found = byName.get(name)
    if (!found) {
      byName.set(name, { name, slug, posts: [post] })
      continue
    }
    if (found.slug !== slug) {
      throw new Error(
        `[series] 系列「${name}」的 seriesSlug 不一致：${found.slug} vs ${slug}，` +
          `同一系列的每篇必须写同一个值（否则系列页会被拆成两个）`,
      )
    }
    found.posts.push(post)
  }

  const list = [...byName.values()]
  for (const s of list) {
    s.posts.sort((a, b) => a.data.pubDate.valueOf() - b.data.pubDate.valueOf())
  }
  // 篇数多的排前面，同篇数按系列名
  list.sort((a, b) => b.posts.length - a.posts.length || a.name.localeCompare(b.name))
  return list
}

/** 某篇文章所属的系列 + 它在系列中的序号（从 1 起）；不属于任何系列则返回 null */
export async function getSeriesOf(
  postId: string,
): Promise<{ series: SeriesInfo; index: number } | null> {
  for (const series of await getAllSeries()) {
    const idx = series.posts.findIndex((p) => p.id === postId)
    if (idx >= 0) return { series, index: idx + 1 }
  }
  return null
}
