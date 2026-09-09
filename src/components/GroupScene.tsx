/**
 * GroupScene — 博文内嵌的"活的群论插图"
 *
 * 包装 @groupviz/react 的受控 Scene 组件。Scene 是渲染内核，本身只做
 * 绘制并把交互事件抛给上层；这里补一层轻量壳：元素选中集合、悬停气泡、
 * 主题切换，以及对称性视图的"元素操作台"（选元素看它在几何体上的作用）。
 *
 *   <GroupScene client:only="react" symbol="A4" view="cayley3d" caption="A₄ 的凯莱图" />
 *
 * 主题说明：默认不写 data-theme，插图跟随页面主题(html[data-theme])；
 * 传 theme="dark"/"light" 可强制单图主题(语境强调用)。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  I18nProvider,
  SetView,
  CycleView,
  CayleyView,
  TableView,
  Cayley3DScene,
  SymmetryViewScene,
} from '@groupviz/react'
import { createGroupFromSymbol } from '@groupviz/core'
import type { GroupElement } from '@groupviz/core'

/** 说明：'coset' 需要额外子群/陪集数据，暂不提供一键封装 */
export type SceneKind = 'set' | 'cycle' | 'cayley' | 'cayley3d' | 'table' | 'symmetry'

export interface GroupSceneProps {
  /** 群的 symbol，如 'A4'、'C_{6}'、'D_{8}'、'S_{4}'、'A5'，传给 createGroupFromSymbol */
  symbol: string
  view: SceneKind
  /** 视图逻辑高度(px)；宽度自适应容器 */
  height?: number
  /** 显示在画布底部的说明文字 */
  caption?: string
  /** 'light' | 'dark' 强制主题；缺省跟随页面主题(推荐) */
  theme?: 'light' | 'dark'
  /** 集合视图：是否常驻显示元素名(默认 true)；3D：是否显示节点标签(默认 true) */
  showLabels?: boolean
  /** 允许点击元素选中/取消(选中环形高亮)。缺省 true */
  selectable?: boolean
  /** 3D：自动缓慢旋转(默认 false) */
  autoRotate?: boolean
  /** 3D：锁定相机(不可拖拽/缩放)，保留点击选中(默认 false) */
  locked?: boolean
  /** 3D：节点球缩放 0.5–2.0(默认 1) */
  nodeScale?: number

  // ── 对称性视图专属 ──
  /** 是否开启元素作用演示(默认 true)。false = 只显示静态多面体 */
  showAction?: boolean
  /** 演示元素：按元素记号(label)或 id 指定，如 '(234)'、'(12)(34)'。缺省自动取首个非恒等 3 阶元 */
  actionElement?: string
  /** 显示"元素操作台"：一排元素按钮，读者可自选元素观察作用(默认 false) */
  picker?: boolean
  /** 操作台只展示这些阶的元素(缺省:全部非恒等元素)。传 1 也能把恒等放进"恒等"分组 */
  pickerOrders?: number[]
  /** 操作台是否包含恒等 e(默认 false) */
  includeIdentity?: boolean
  /** 演示动画倍速 0.2–5(默认 1) */
  rotateSpeed?: number
  /** 对称性视图：是否显示顶部群名+几何描述(默认 true) */
  showFigureTitle?: boolean
  /** 演示自动循环重播(默认 false)。读者也可用操作台上的 ▶/⏸ 现场开关 */
  autoDemo?: boolean
  /** 底部右侧操作提示；缺省按 view 给默认文案 */
  hint?: string
}

const VIEW_LABEL: Record<SceneKind, string> = {
  set: '集合视图',
  cycle: '循环图',
  cayley: '凯莱图',
  cayley3d: '凯莱图 · 3D',
  table: '乘法表',
  symmetry: '对称性视图',
}

const DEFAULT_HINT: Record<SceneKind, string> = {
  set: '悬停查看元素 · 点击选中',
  cycle: '悬停查看元素 · 点击选中',
  cayley: '悬停查看元素 · 点击选中',
  cayley3d: '拖动旋转 · 滚轮缩放 · 点击选中',
  table: '点击行列/格点查看',
  symmetry: '红轴 = 旋转轴 · 黄球 = 固定顶点 · 青球 = 棱中点',
}

interface HoverState {
  label: string | null
  x: number
  y: number
}

/** 按群类型给"阶"配可读的角色名(用于操作台分组) */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}
/** 元素的阶 = value(置换)各循环长度的最小公倍数;恒等 value=[1,2,…,n] → 1 */
export function elementOrder(el: GroupElement): number {
  const val: number[] = el.value as number[]
  const n = val.length
  const visited = new Array(n).fill(false)
  let order = 1
  for (let i = 0; i < n; i++) {
    if (visited[i]) continue
    let j = i
    let len = 0
    while (!visited[j]) {
      visited[j] = true
      j = val[j] - 1
      len++
    }
    if (len > 1) order = (order / gcd(order, len)) * len
  }
  return order
}

function orderTitle(order: number, symbol: string, includeAngle: boolean): string {
  const s = symbol.replace(/[{}_]/g, '').toLowerCase()
  if (order === 1) return '恒等'
  const angle = includeAngle
    ? s === 'a4' && order === 3 ? ' · ±120°'
      : s === 'a4' && order === 2 ? ' · 180°'
        : ''
    : ''
  if (s === 'a4' && order === 3) return '3 次轴 · 3-循环' + angle
  if (s === 'a4' && order === 2) return '2 次轴 · 双对换' + angle
  return `阶 ${order}` + angle
}

/** 元素在四面体/几何体上的作用描述(操作台当前项的状态行) */
function describeElement(el: GroupElement, groupSymbol: string): string {
  const s = groupSymbol.replace(/[{}_]/g, '').toLowerCase()
  const o = elementOrder(el)
  if (s === 'a4') {
    if (o === 3) return '3-循环：绕顶点轴转 120°——黄球顶点不动，其余三色轮换'
    if (o === 2) return '双对换：绕相对棱轴转 180°——红轴穿过两个青球'
  }
  if (o > 1) return `阶 ${o} 元素：绕几何体的对称轴旋转`
  return '恒等：什么都不做'
}

export default function GroupScene({
  symbol,
  view,
  height = 400,
  caption,
  theme,
  showLabels,
  selectable = true,
  autoRotate,
  locked,
  nodeScale,
  showAction,
  actionElement,
  picker = false,
  pickerOrders,
  includeIdentity = false,
  rotateSpeed,
  showFigureTitle,
  autoDemo = false,
  hint,
}: GroupSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [hover, setHover] = useState<HoverState>({ label: null, x: 0, y: 0 })
  const [resolvedDark, setResolvedDark] = useState(false)

  // 对称性视图操作台状态
  const [pickedLabel, setPickedLabel] = useState<string | null>(null)
  const [autoOn, setAutoOn] = useState(autoDemo)
  const [replayTick, setReplayTick] = useState(0)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 跟随页面主题(html data-theme / prefers-color-scheme)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const resolve = () => {
      const htmlTheme = document.documentElement.getAttribute('data-theme')
      if (htmlTheme === 'dark' || htmlTheme === 'light') {
        setResolvedDark(htmlTheme === 'dark')
      } else {
        setResolvedDark(window.matchMedia('(prefers-color-scheme: dark)').matches)
      }
    }
    resolve()

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onMq = () => resolve()
    mq.addEventListener('change', onMq)

    const observer = new MutationObserver(() => resolve())
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      mq.removeEventListener('change', onMq)
      observer.disconnect()
    }
  }, [])

  const group = useMemo(() => createGroupFromSymbol(symbol), [symbol])
  const transform = useMemo(() => ({ x: 0, y: 0, scale: 1 }), [])

  const sceneWidth = width > 0 ? width : 560
  const viewBox = useMemo(() => ({ width: sceneWidth, height }), [sceneWidth, height])

  // label 或 id → 元素(读者在 MDX 里写记号,内核要的是 id)
  const resolveElement = useMemo(() => {
    if (!group) return (_: string | null | undefined): GroupElement | null => null
    const byLabel = new Map<string, GroupElement>()
    const byId = new Map<string, GroupElement>()
    for (const el of group.elements) {
      byLabel.set(el.label, el)
      byId.set(el.id, el)
    }
    return (ref: string | null | undefined) =>
      (ref ? byLabel.get(ref) ?? byId.get(ref) ?? null : null)
  }, [group])

  const isIdentityEl = (el: GroupElement | null) =>
    !!el && !!group && el.id === group.identity.id

  // 当前演示元素(操作台优先，其次 props.actionElement，最后自动兜底)
  const activeEl = useMemo<GroupElement | null>(() => {
    if (!group) return null
    if (picker) {
      const fromPick = resolveElement(pickedLabel)
      if (fromPick) return fromPick
    }
    const fromProp = resolveElement(actionElement)
    if (fromProp) return fromProp
    // 自动兜底：首个非恒等 3 阶元，其次 2 阶元
    const order3 = group.elements.find(el => elementOrder(el) === 3 && el.id !== group.identity.id)
    if (order3) return order3
    const order2 = group.elements.find(el => elementOrder(el) === 2 && el.id !== group.identity.id)
    return order2 ?? null
  }, [group, picker, pickedLabel, actionElement, resolveElement])

  const activeId = activeEl?.id ?? null
  const symShowAction =
    showAction ??
    (picker ? (activeEl ? !isIdentityEl(activeEl) : false) : actionElement != null || activeEl != null)
  const symActionElementId = symShowAction ? (isIdentityEl(activeEl) ? null : activeId) : null

  // 操作台：按阶分组
  const pickerGroups = useMemo(() => {
    if (!group || !picker) return []
    const ordersSet = new Set<number>(pickerOrders)
    const list = group.elements.filter(el => {
      if (el.id === group.identity.id) return includeIdentity
      return pickerOrders ? ordersSet.has(elementOrder(el)) : true
    })
    const byOrder = new Map<number, GroupElement[]>()
    for (const el of list) {
      const o = elementOrder(el)
      const arr = byOrder.get(o) ?? []
      arr.push(el)
      byOrder.set(o, arr)
    }
    return [...byOrder.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([order, els]) => ({
        order,
        title: orderTitle(order, group.symbol, els.length > 1),
        els,
      }))
  }, [group, picker, pickerOrders, includeIdentity])

  // 自动循环重播
  useEffect(() => {
    if (!autoOn || !symActionElementId) return
    const iv = window.setInterval(() => setReplayTick(t => t + 1), 2100)
    return () => window.clearInterval(iv)
  }, [autoOn, symActionElementId])

  const handlePick = (label: string) => {
    setPickedLabel(label)
    setReplayTick(t => t + 1)
  }
  const handleReplay = () => setReplayTick(t => t + 1)

  const onSelect = (id: string, additive: boolean) => {
    if (!selectable) return
    setSelected(prev => {
      const next = new Set(prev)
      if (additive) {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      } else {
        next.clear()
        next.add(id)
      }
      return next
    })
  }

  const onHover2D = (el: GroupElement | null, anchor?: { x: number; y: number } | null) => {
    if (el && anchor) setHover({ label: el.label, x: anchor.x, y: anchor.y })
    else setHover(h => (h.label ? { label: null, x: 0, y: 0 } : h))
  }
  const onHoverTable = (el: GroupElement | null) => {
    if (el) setHover({ label: el.label, x: 14, y: 14 })
    else setHover(h => (h.label ? { label: null, x: 0, y: 0 } : h))
  }

  // 常驻标签默认策略
  const sceneShowLabels = showLabels ?? (view === 'set' || view === 'cayley3d' ? true : false)
  const isSymDemo = view === 'symmetry' && (symShowAction || picker)
  const activeHint =
    hint ??
    (isSymDemo && picker && activeEl
      ? describeElement(activeEl, group?.symbol ?? symbol)
      : isSymDemo && activeEl
        ? describeElement(activeEl, group?.symbol ?? symbol)
        : DEFAULT_HINT[view])
  const themeAttr = theme ? { 'data-theme': theme } : {}
  const isDark = theme ? theme === 'dark' : resolvedDark

  return (
    <div className="gv-scene" {...themeAttr}>
      {picker && group && (
        <div className="gv-sym-picker">
          <div className="gv-sym-groups">
            {pickerGroups.map(grp => (
              <span key={grp.order} className="gv-sym-group">
                <span className="gv-sym-gtitle">{grp.title}</span>
                {grp.els.map(el => {
                  const isActive = activeEl?.id === el.id
                  return (
                    <button
                      key={el.id}
                      type="button"
                      className={'gv-sym-chip' + (isActive ? ' is-active' : '')}
                      aria-pressed={isActive}
                      onClick={() => handlePick(el.label)}
                      title={describeElement(el, group.symbol)}
                    >
                      {el.label}
                    </button>
                  )
                })}
              </span>
            ))}
          </div>
          <div className="gv-sym-ctl">
            <button
              type="button"
              className="gv-sym-btn"
              onClick={handleReplay}
              disabled={!symActionElementId}
              title="重播一次动画"
            >
              ⟳ 重播
            </button>
            <button
              type="button"
              className="gv-sym-btn"
              onClick={() => setAutoOn(o => !o)}
              aria-pressed={autoOn}
              title={autoOn ? '暂停自动循环' : '让动画自动循环播放'}
            >
              {autoOn ? '⏸ 暂停循环' : '▶ 自动循环'}
            </button>
          </div>
        </div>
      )}

      <div ref={hostRef} className="gv-scene-host" style={{ height }}>
        {group == null ? (
          <div className="gv-scene-empty">无法识别的群 symbol：{symbol}</div>
        ) : width > 0 ? (
          <I18nProvider>
            {view === 'set' && (
              <SetView
                group={group}
                selectedElements={selected}
                canvasTransform={transform}
                viewBoxSize={viewBox}
                showLabels={sceneShowLabels}
                onSelect={onSelect}
                onHover={onHover2D}
              />
            )}
            {view === 'cycle' && (
              <CycleView
                group={group}
                selectedElements={selected}
                canvasTransform={transform}
                viewBoxSize={viewBox}
                onSelect={onSelect}
                onHover={onHover2D}
              />
            )}
            {view === 'cayley' && (
              <CayleyView
                group={group}
                selectedElements={selected}
                canvasTransform={transform}
                viewBoxSize={viewBox}
                showLabels={sceneShowLabels}
                onSelect={onSelect}
                onHover={onHover2D}
              />
            )}
            {view === 'table' && (
              <TableView
                group={group}
                selectedElements={selected}
                canvasTransform={transform}
                viewBoxSize={viewBox}
                onSelect={onSelect}
                onHover={onHoverTable}
              />
            )}
            {view === 'cayley3d' && (
              <Cayley3DScene
                group={group}
                selectedElements={selected}
                onSelectElement={onSelect}
                showLabels={sceneShowLabels}
                autoRotate={autoRotate}
                locked={locked}
                nodeScale={nodeScale}
              />
            )}
            {view === 'symmetry' && (
              <SymmetryViewScene
                group={group}
                showAction={symShowAction}
                actionElementId={symActionElementId}
                dark={isDark}
                locked={locked}
                rotateSpeed={rotateSpeed}
                showFigureTitle={showFigureTitle}
                replaySignal={replayTick}
              />
            )}
          </I18nProvider>
        ) : null}

        {hover.label && (
          <div className="gv-tip" style={{ left: hover.x, top: hover.y }} role="status">
            {hover.label}
          </div>
        )}
      </div>
      <div className="gv-scene-meta">
        <span className="gv-scene-chip">
          {symbol} · {VIEW_LABEL[view]}
        </span>
        {caption ? (
          <span className="gv-scene-caption" title={caption}>
            {caption}
          </span>
        ) : null}
        <span className="gv-scene-hint">{activeHint}</span>
      </div>
    </div>
  )
}
