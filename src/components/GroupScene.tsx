/**
 * GroupScene — 博文内嵌的"活的群论插图"
 *
 * 包装 @groupviz/react 的受控 Scene 组件。Scene 是渲染内核，本身只做
 * 绘制并把交互事件抛给上层；这里补一层轻量壳：元素选中集合、悬停气泡、
 * 主题切换，让插图能按文章语境获得不同交互程度。
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
  /** 3D / 对称性视图：锁定相机(不可拖拽/缩放)，保留点击选中(默认 false) */
  locked?: boolean
  /** 3D：节点球缩放 0.5–2.0(默认 1) */
  nodeScale?: number
  /** 对称性视图：是否开启元素作用演示（默认 true）。设为 false 只显示静态多面体 */
  showAction?: boolean
  /** 对称性视图：要演示的元素 id(如 '(234)'、'(12)(34)'、'(1234)')。缺省用首个非恒等 3 阶元 */
  actionElement?: string
  /** 对称性视图：动画倍速 0.2–5(默认 1) */
  rotateSpeed?: number
  /** 对称性视图：是否显示顶部群名+几何描述(默认 true) */
  showFigureTitle?: boolean
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
  symmetry: '演示元素在几何体上的旋转作用 · 拖动旋转',
}

interface HoverState {
  label: string | null
  x: number
  y: number
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
  rotateSpeed,
  showFigureTitle,
  hint,
}: GroupSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [hover, setHover] = useState<HoverState>({ label: null, x: 0, y: 0 })
  const [resolvedDark, setResolvedDark] = useState(false)

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

  // 对称性视图缺省演示元素：首个非恒等 3 阶元；其次首个非恒等 2 阶元
  const defaultActionElement = useMemo(() => {
    if (!group) return null
    if (actionElement) return actionElement
    const order3 = group.elements.find((el: GroupElement) => el.order === 3 && el.id !== group.identity.id)
    if (order3) return order3.id
    const order2 = group.elements.find((el: GroupElement) => el.order === 2 && el.id !== group.identity.id)
    return order2?.id ?? group.elements[1]?.id ?? group.identity.id
  }, [group, actionElement])

  // 对称性视图缺省演示元素：显式 showAction=false 时关闭；否则用 actionElement，
  // 再 fallback 到首个非恒等 3 阶元 / 2 阶元
  const symShowAction = showAction ?? (actionElement ? true : defaultActionElement != null)
  const symActionElementId = symShowAction ? (actionElement ?? defaultActionElement) : null

  const onSelect = (id: string, additive: boolean) => {
    if (!selectable) return
    setSelected(prev => {
      const next = new Set(prev)
      if (additive) {
        // 修饰键点击：加入/移出
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
    // 乘法表不提供屏幕锚点：气泡就近固定在左上角
    if (el) setHover({ label: el.label, x: 14, y: 14 })
    else setHover(h => (h.label ? { label: null, x: 0, y: 0 } : h))
  }

  // 常驻标签默认策略：集合视图与 3D 开着便于辨识；平面凯莱图/循环图关掉，
  // 靠悬停气泡就地读元素(避免标签遮蔽边结构)
  const sceneShowLabels = showLabels ?? (view === 'set' || view === 'cayley3d' ? true : false)
  const activeHint = hint ?? DEFAULT_HINT[view]
  const themeAttr = theme ? { 'data-theme': theme } : {}
  const isDark = theme ? theme === 'dark' : resolvedDark

  return (
    <div className="gv-scene" {...themeAttr}>
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
              />
            )}
          </I18nProvider>
        ) : null}

        {hover.label && (
          <div
            className="gv-tip"
            style={{ left: hover.x, top: hover.y }}
            role="status"
          >
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
