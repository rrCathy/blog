// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import mdx from '@astrojs/mdx'
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
