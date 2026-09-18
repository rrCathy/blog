/**
 * 搜索索引 JSON 端点（构建期静态生成 dist/search-index.json）。
 *
 * - 字段定义见 src/lib/search-index.ts
 * - Content-Type 用 application/json; charset=utf-8，避免某些环境按 GBK 解
 * - URL 在 base 之下，部署后可直接 fetch
 */
import type { APIRoute } from 'astro'
import { buildSearchIndex } from '../lib/search-index'

export const GET: APIRoute = async () => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const entries = await buildSearchIndex(base)

  return new Response(JSON.stringify({ posts: entries }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  })
}