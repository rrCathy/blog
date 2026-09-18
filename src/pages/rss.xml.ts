/**
 * RSS 端点 —— 元数据版。全文由构建后处理回填（见 scripts/fill-rss.mjs）。
 *
 * 为什么不在这里渲染 MDX 全文：AstroContainer 渲染 MDX Content 在 astro 6
 * 构建环境实测报「@astrojs/markdown-remark does not provide an export named
 * 'unified'」（容器管线与构建管线模块版本错位）。而文章页本来就渲染成完整
 * HTML 落盘 dist/，后处理脚本从那里抠正文塞回 <content:encoded> 最稳——
 * 与线上页面同一条渲染管线，KaTeX/表格/引用全部原样。
 *
 * item 里的 content 字段故意不传：@astrojs/rss 只有在存在 content 时才写
 * xmlns:content 命名空间，回填脚本需要自己补命名空间声明。
 */
import rss from '@astrojs/rss'
import { getCollection } from 'astro:content'
import type { APIContext } from 'astro'

export async function GET(context: APIContext) {
  const posts = (await getCollection('blog'))
    .filter((p) => !p.data.draft)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())

  return rss({
    title: "rrCathy's Blog",
    description: '数学笔记与技术记录 —— 群论可视化、前端开发等',
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/blog/${post.id}/`,
      categories: post.data.tags,
    })),
    customData: '<language>zh-CN</language>',
  })
}