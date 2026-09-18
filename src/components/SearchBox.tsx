/**
 * 站内搜索框。
 *
 * - 触发：BaseLayout header 的搜索按钮（点 / Ctrl+K / Cmd+K / "/"）
 * - 索引：fetch('/blog/search-index.json')，客户端 fuse.js 模糊匹配
 * - 字段权重：title(3) > description(2) > tags(2.5) > body(1)
 * - 键盘：↑/↓ 选中、Enter 跳转、Esc 关闭
 * - 主题：跟随 <html data-theme>，浅深都自适应
 *
 * 挂载方式 client:idle：每个页面只有这一个挂载点，不会被活图 idle 饿死；
 * （同 ShareBar 改 visible 的原因不一样——ShareBar 是文章页底部，那里 21 个 island）
 */
import Fuse from 'fuse.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface SearchEntry {
  id: string
  title: string
  description: string
  tags: string[]
  pubDate: string
  url: string
  body: string
}

interface SearchResult {
  item: SearchEntry
  score?: number
  /** body 里的命中片段（前后各 ~40 字） */
  snippet?: string
}

const FUSE_OPTIONS: ConstructorParameters<typeof Fuse<SearchEntry>>[1] = {
  keys: [
    { name: 'title', weight: 3 },
    { name: 'description', weight: 2 },
    { name: 'tags', weight: 2.5 },
    { name: 'body', weight: 1 },
  ],
  threshold: 0.4, // 中文匹配更宽松——单字也能命中
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
}

/**
 * 在 body 里找首个命中（不区分大小写），前后各切 40 字做 snippet。
 * 没有命中就拿前 120 字当摘要。
 */
function makeSnippet(body: string, query: string): string {
  if (!body) return ''
  const q = query.trim().toLowerCase()
  if (!q) return body.slice(0, 120) + (body.length > 120 ? '…' : '')
  const idx = body.toLowerCase().indexOf(q)
  if (idx < 0) return body.slice(0, 120) + (body.length > 120 ? '…' : '')
  const start = Math.max(0, idx - 40)
  const end = Math.min(body.length, idx + q.length + 80)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < body.length ? '…' : ''
  return prefix + body.slice(start, end) + suffix
}

export default function SearchBox(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const [indexReady, setIndexReady] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const fuseRef = useRef<Fuse<SearchEntry> | null>(null)
  const dataRef = useRef<SearchEntry[] | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // 全局快捷键：Ctrl/⌘ + K 或 "/" 打开搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inField =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      // "/" 仅在非输入态触发，避免与正文冲突；Ctrl/⌘+K 始终触发
      if ((e.key === '/' && !inField) || ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey))) {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // 打开时聚焦输入框；锁滚动
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // 等模态框挂载完再聚焦
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => {
      document.body.style.overflow = prevOverflow
      clearTimeout(t)
    }
  }, [open])

  // 懒加载索引：首次打开时才 fetch，避免拖慢首屏
  const ensureIndex = useCallback(async () => {
    if (dataRef.current && fuseRef.current) return
    setLoading(true)
    try {
      const res = await fetch(import.meta.env.BASE_URL + 'search-index.json')
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const data: { posts: SearchEntry[] } = await res.json()
      dataRef.current = data.posts
      fuseRef.current = new Fuse(data.posts, FUSE_OPTIONS)
      setIndexReady(true)
    } catch (err) {
      console.error('[search] 索引加载失败', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void ensureIndex()
  }, [open, ensureIndex])

  // 查询变化时跑模糊搜索
  useEffect(() => {
    const fuse = fuseRef.current
    if (!fuse) return
    const q = query.trim()
    if (!q) {
      setResults([])
      setActiveIdx(0)
      return
    }
    const list = fuse.search(q, { limit: 12 })
    setResults(list.map((r) => ({ item: r.item, score: r.score, snippet: makeSnippet(r.item.body, q) })))
    setActiveIdx(0)
  }, [query])

  // 列表项滚动同步
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
    if (item) item.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setResults([])
    setActiveIdx(0)
  }, [])

  const onInputKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (results.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const target = results[activeIdx]
        if (target) {
          window.location.href = target.item.url
          close()
        }
      }
    },
    [results, activeIdx, close],
  )

  // 高亮 snippet 里的查询字符（按空白分词，每个 token 单独标）
  const highlightedSnippet = useMemo(() => {
    if (!query.trim()) return null
    const tokens = query.trim().split(/\s+/).filter((t) => t.length >= 2)
    if (tokens.length === 0) return null
    const re = new RegExp(`(${tokens.map(escapeRe).join('|')})`, 'gi')
    return (text: string) =>
      text.split(re).map((part, i) =>
        re.test(part) ? (
          <mark key={i} className="search-mark">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )
  }, [query])

  return (
    <>
      <button
        type="button"
        className="search-trigger"
        aria-label="打开站内搜索（快捷键 Ctrl+K）"
        title="站内搜索 (Ctrl/⌘ + K)"
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-3.6-3.6" />
        </svg>
        <span className="search-trigger-label">搜索</span>
        <kbd className="search-trigger-kbd" aria-hidden="true">/</kbd>
      </button>

      {open && (
        <div
          className="search-modal"
          role="dialog"
          aria-modal="true"
          aria-label="站内搜索"
          onClick={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <div className="search-panel" onClick={(e) => e.stopPropagation()}>
            <div className="search-bar">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m20 20-3.6-3.6" />
              </svg>
              <input
                ref={inputRef}
                type="search"
                className="search-input"
                placeholder={loading ? '加载索引…' : indexReady ? '搜标题、标签、正文…' : '搜索'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                aria-label="搜索关键词"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="search-close"
                aria-label="关闭搜索"
                onClick={close}
              >
                <kbd>Esc</kbd>
              </button>
            </div>

            {!query.trim() && (
              <div className="search-hint">
                <p>输入关键词搜索站内文章。↑/↓ 选中，Enter 打开，Esc 关闭。</p>
                {dataRef.current && (
                  <p className="search-hint-meta">索引 {dataRef.current.length} 篇文章</p>
                )}
              </div>
            )}

            {query.trim() && results.length === 0 && indexReady && !loading && (
              <div className="search-empty">没有命中。换个关键词试试。</div>
            )}

            {results.length > 0 && (
              <ul className="search-results" ref={listRef} role="listbox">
                {results.map((r, i) => (
                  <li
                    key={r.item.id}
                    data-idx={i}
                    className={`search-result${i === activeIdx ? ' is-active' : ''}`}
                    role="option"
                    aria-selected={i === activeIdx}
                  >
                    <a
                      href={r.item.url}
                      className="search-result-link"
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={close}
                    >
                      <div className="search-result-head">
                        <span className="search-result-title">{r.item.title}</span>
                        <span className="search-result-date">{r.item.pubDate}</span>
                      </div>
                      {r.item.tags.length > 0 && (
                        <div className="search-result-tags">
                          {r.item.tags.map((t) => (
                            <span key={t} className="search-result-tag">
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                      {r.snippet && (
                        <div className="search-result-snippet">
                          {highlightedSnippet ? highlightedSnippet(r.snippet) : r.snippet}
                        </div>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}