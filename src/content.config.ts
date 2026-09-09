import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

/**
 * 博客内容集合：src/content/blog/*.{md,mdx}
 * - .md   纯文本文章（技术记录、日常）
 * - .mdx  数学/交互文章（可内联 <GroupScene> 等 React 组件）
 */
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    /** 最后实质更新日期(可选,显示在文章底部信息区) */
    updateDate: z.coerce.date().optional(),
    /** 每篇独立配置 tags；展示侧按出现顺序自动聚合 */
    tags: z.array(z.string()).default([]),
    /** true = 草稿，不进列表与 RSS */
    draft: z.boolean().default(false),
  }),
})

export const collections = { blog }
