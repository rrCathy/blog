/**
 * GroupScene — 博文内嵌的"活的群论插图"
 *
 * 包装 @groupviz/react 的受控 Scene 组件：
 * 写文章时只需指定群的 symbol 与视图类型，例如
 *
 *   <GroupScene client:only="react" symbol="A4" view="cycle" caption="A₄ 的循环图" />
 *
 * Scene 是受控内核：宿主通过 props 注入选中集、画布变换与 viewBox 尺寸。
 * 这里做最小封装 —— 静态展示 + 可选的 hover/点击读取(留作交互扩展点)。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { I18nProvider, SetView, CycleView, CayleyView, TableView } from '@groupviz/react'
import { createGroupFromSymbol } from '@groupviz/core'

/** 说明：'coset' 需要额外子群/陪集数据，暂不提供一键封装 */
export type SceneKind = 'set' | 'cycle' | 'cayley' | 'table'

export interface GroupSceneProps {
  /** 群的 symbol，如 'A4'、'C_{6}'、'D_{8}'，传给 createGroupFromSymbol */
  symbol: string
  view: SceneKind
  /** 视图逻辑高度(px)；宽度自适应容器 */
  height?: number
  /** 显示在深色画布上的标题说明 */
  caption?: string
  /** 集合视图是否常驻显示元素名(默认开) */
  showLabels?: boolean
}

const VIEW_LABEL: Record<SceneKind, string> = {
  set: '集合视图',
  cycle: '循环图',
  cayley: '凯莱图',
  table: '乘法表',
}

export default function GroupScene({
  symbol,
  view,
  height = 380,
  caption,
  showLabels,
}: GroupSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const group = useMemo(() => createGroupFromSymbol(symbol), [symbol])
  const selected = useMemo(() => new Set<string>(), [])
  const transform = useMemo(() => ({ x: 0, y: 0, scale: 1 }), [])

  const sceneWidth = width > 0 ? width : 520
  const viewBox = useMemo(
    () => ({ width: sceneWidth, height }),
    [sceneWidth, height],
  )

  return (
    <div
      className="gv-scene"
      data-theme="dark"
      style={{ height: height + (caption ? 30 : 0) }}
    >
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
                showLabels={showLabels ?? true}
              />
            )}
            {view === 'cycle' && (
              <CycleView
                group={group}
                selectedElements={selected}
                canvasTransform={transform}
                viewBoxSize={viewBox}
              />
            )}
            {view === 'cayley' && (
              <CayleyView
                group={group}
                selectedElements={selected}
                canvasTransform={transform}
                viewBoxSize={viewBox}
              />
            )}
            {view === 'table' && (
              <TableView
                group={group}
                selectedElements={selected}
                canvasTransform={transform}
                viewBoxSize={viewBox}
              />
            )}
          </I18nProvider>
        ) : null}
      </div>
      <div className="gv-scene-meta">
        <span className="gv-scene-chip">
          {symbol} · {VIEW_LABEL[view]}
        </span>
        {caption && <span className="gv-scene-caption">{caption}</span>}
      </div>
    </div>
  )
}
