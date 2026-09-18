// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'

// site: 最终部署在 https://rrcathy.github.io/blog/ (Pages 仓库子目录)
export default defineConfig({
  site: 'https://rrcathy.github.io',
  base: '/blog/',
  trailingSlash: 'ignore',
  integrations: [
    react(),
    mdx({
      remarkPlugins: [remarkGfm, remarkMath],
      rehypePlugins: [[rehypeKatex, { strict: false }]],
    }),
    // sitemap 集成：自动覆盖所有静态页；filter 排除草稿页（frontmatter draft:true
    // 仍会生成可访问 URL，但不应被搜索引擎收录——见 src/content.config.ts 注释）
    sitemap({
      filter: (page) => !page.includes('/zzbug/'),
    }),
  ],
  markdown: {
    remarkPlugins: [remarkGfm, remarkMath],
    rehypePlugins: [[rehypeKatex, { strict: false }]],
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },
})
