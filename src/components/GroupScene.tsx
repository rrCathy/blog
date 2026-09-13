/**
 * GroupScene — 博文内嵌的"活的群论插图"
 *
 * 包装 @groupviz/react（>=2.1.2）的受控 Scene 组件。Scene 是渲染内核，本身只做
 * 绘制并把交互事件抛给上层。2.1 起引擎自带了外部嵌入所需的便利层，这里就只保留
 * 博文特有的部分：元素操作台、说明栏、子群切换，其余交给引擎：
 *
 *   - 状态 / 平移缩放 / hover 气泡 → useSceneState（四件套 + 拖拽平移 + 滚轮缩放）
 *   - 元素引用（label / id / 循环记号）→ core.resolveElement，写错会 console.warn
 *   - 元素阶 → core.elementOrder（group-first）
 *
 *   <GroupScene client:only="react" symbol="A4" view="cayley3d" caption="A₄ 的凯莱图" />
 *
 * 主题说明：默认不写 data-theme，插图跟随页面主题(html[data-theme])；
 * 传 theme="dark"/"light" 可强制单图主题(语境强调用)。
 */
import { useEffect, useMemo, useState } from 'react'
import {
  I18nProvider,
  SetView,
  CycleView,
  CayleyView,
  TableView,
  Cayley3DScene,
  SymmetryViewScene,
  useSceneState,
} from '@groupviz/react'
import {
  createGroupFromSymbol,
  buildSubgroupGroup,
  resolveElement as resolveEl,
  elementOrder as orderOf,
  wordLengthSphereActions,
  COLOR_PALETTE,
} from '@groupviz/core'
import type { Group, GroupElement, CayleyPathHighlight, Layout3D, CayleyActionParam, CayleyShape2D } from '@groupviz/core'
import { LAYOUTS_3D, CAYLEY_SHAPES_2D } from '@groupviz/core'

/** 说明：'coset' 需要额外子群/陪集数据，暂不提供一键封装 */
export type SceneKind = 'set' | 'cycle' | 'cayley' | 'cayley3d' | 'table' | 'symmetry'

export interface GroupSceneProps {
  /** 群的 symbol，如 'A4'、'C_{6}'、'D_{8}'、'S_{4}'、'A5'，传给 createGroupFromSymbol */
  symbol: string
  /** 只展示 symbol 里的一个子群：子群的显示记号(如 'V_{4}')；须配合 members 使用 */
  subgroup?: string
  /** 子群成员的元素记号(逗号分隔，如 '(12)(34),(13)(24),(14)(23)')，恒等元自动补入 */
  members?: string
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
  /**
   * 3D：布局形状（透传引擎 `layout3D`）。缺省按群自动选。
   * 可传引擎任意预设（LAYOUTS_3D），如 A₄ 'truncatedTetrahedron'、
   * S₄ 的 'truncatedOctahedron2'（2 生成元缺省）/ 'truncatedOctahedron3'（3 相邻对换版）；
   * 写错的名字自动退回缺省形状。
   * 传 'wordLengthSphere' 走**字长球**：元素按「字长 = 相邻对换下的最短生成元个数」
   * 分层铺在同心圆上，北极 e、南极 w₀、同层同色。作用边会自动补成相邻对换集
   * （传了 actions 也以自动集为准，分层才成立）。
   * 仅 n = 4/5 的 one-line 置换群可用，其余群布局返回 null 会退回缺省形状。
   */
  layout3D?: string
  /** 乘法表：单元格边长 px(默认 50)。调大可缓解 (12)(34) 这类长记号的表头重叠 */
  cellSize?: number

  // ── 凯莱图专属（view: 'cayley' | 'cayley3d'）──
  /**
   * 自定义作用元素（广义凯莱图：任意群元素，不限于生成元）。
   * 接受元素引用（label / id / 循环记号），逗号分隔，如 '(12),(23)'；缺省用群的生成元。
   * 这是凯莱图依赖生成元选取的接口——换一组写法就换一张图。
   */
  actions?: string
  /**
   * 逐生成元边长倍率（透传引擎 CayleyActionParam.lengthScale）：'元素引用=倍率' 逗号分隔，
   * 如 '(12)(34)=1.4,(234)=0.6'。倍率 0.3–3，固定几何布局经「长度约束松弛」后处理，
   * 力导向布局作为弹簧静止长度倍率。须与 actions 同用（按 actions 里的作用元素生效）。
   */
  lengthScales?: string
  /** 边的乘法方向：右乘 x→x·s（默认）或左乘 x→s·x */
  multiplyType?: 'right' | 'left'

  /**
   * 路径高亮（VCL）：逗号分隔的元素引用序列，相邻两项须由某条作用边相连；
   * 或特殊值 'sjt' = 自动生成 Sₙ 的 SJT 哈密顿回路（n=4/5，首尾一步回首）。
   * 高亮时其余边默认淡化，只留路径醒目。
   */
  path?: string
  /** 路径高亮颜色；缺省金色 #ffd93d。字长球建议传白色等与生成元配色不撞的颜色 */
  pathColor?: string
  /** 路径高亮线宽；缺省 5 */
  pathWidth?: number
  /** 沿路径逐步点亮（进入即播放） */
  pathAnimate?: boolean
  /** 悬停节点时显示经过次序徽标 ① ② ③ … */
  pathShowOrder?: boolean
  /**
   * 2D 凯莱图边弯曲度倍率（透传引擎 edgeCurvature）。缺省 1（自适应弧）；
   * 0 = 笔直（S₃ 环的直边六边形样式就是它）；2 = 更弯。
   */
  edgeCurvature?: number

  /**
   * 2D 凯莱图布局形状（透传引擎 `shape2D`）。缺省按群自动选（getDefaultShape2D）。
   * 可传引擎任意预设（CAYLEY_SHAPES_2D），如循环群的 'spiral'（螺旋）/'coil'
   * （玫瑰——大阶循环群下边交叉像玫瑰）、万能的 'cone'（圆锥俯视同心环）、
   * A₄ 的 'rewiring'（半直积重布线形态）；写错的名字自动退回缺省形状。
   */
  shape?: string

  /** 是否显示底部说明栏（群记号 chip + caption + 提示）。缺省 true；封面等纯图语境传 false */
  meta?: boolean

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

/** 字长球布局下的视图名（只在 S₄/S₅ + layout3D 命中时用） */
const WORD_LENGTH_LABEL = '字长球 · 3D'

/**
 * SJT（Steinhaus–Johnson–Trotter）生成 one-line 置换的哈密顿回路，转成 group 的 label 列表。
 * 每一步交换相邻两个位置（右乘相邻对换），n! 个排列无重复、首尾一步回首。
 * 仅对 n=4/5 的 one-line 置换群有意义；value 结构不匹配或 n 不在此范围返回空数组。
 */
function sjtLabels(group: Group): string[] {
  const first = group.elements[0]?.value
  if (!Array.isArray(first)) return []
  const n = first.length
  if (n !== 4 && n !== 5) return []
  const byValue = new Map(group.elements.map((e) => [e.value.join(','), e.label]))
  const a = Array.from({ length: n }, (_, i) => i + 1)
  const dir = new Array(n).fill(-1)
  const labels: string[] = []
  let guard = 0
  while (guard++ < 100000) {
    const label = byValue.get(a.join(','))
    if (label == null) return []
    labels.push(label)
    let m = -1
    for (let i = 0; i < n; i++) {
      const j = i + dir[a[i] - 1]
      if (j >= 0 && j < n && a[j] < a[i] && (m === -1 || a[i] > a[m])) m = i
    }
    if (m === -1) break
    const j = m + dir[a[m] - 1]
    ;[a[m], a[j]] = [a[j], a[m]]
    for (let x = a[j] + 1; x <= n; x++) dir[x - 1] *= -1
  }
  return labels
}


const DEFAULT_HINT: Record<SceneKind, string> = {
  set: '悬停查看元素 · 点击选中 · 拖动平移',
  cycle: '悬停查看元素 · 点击选中 · 拖动平移',
  cayley: '悬停查看元素 · 点击选中 · 拖动平移',
  cayley3d: '拖动旋转 · 滚轮缩放 · 点击选中',
  table: '点击行列/格点查看',
  symmetry: '红轴 = 旋转轴 · 黄球 = 固定顶点 · 青球 = 棱中点',
}

/** 按群类型给"阶"配可读的角色名(用于操作台分组) */
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
function describeElement(el: GroupElement, groupSymbol: string, order: number): string {
  const s = groupSymbol.replace(/[{}_]/g, '').toLowerCase()
  if (s === 'a4') {
    if (order === 3) return '3-循环：绕顶点轴转 120°——黄球顶点不动，其余三色轮换'
    if (order === 2) return '双对换：绕相对棱轴转 180°——红轴穿过两个青球'
  }
  if (order > 1) return `阶 ${order} 元素：绕几何体的对称轴旋转`
  return '恒等：什么都不做'
}

export default function GroupScene({
  symbol,
  subgroup,
  members,
  view,
  height = 400,
  caption,
  theme,
  showLabels,
  selectable = true,
  autoRotate,
  locked,
  nodeScale,
  layout3D,
  cellSize,
  actions,
  lengthScales,
  multiplyType,
  path,
  pathColor,
  pathWidth,
  pathAnimate,
  pathShowOrder,
  edgeCurvature,
  shape,
  meta = true,
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
  const [resolvedDark, setResolvedDark] = useState(false)

  // 对称性视图操作台状态
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [autoOn, setAutoOn] = useState(autoDemo)
  const [replayTick, setReplayTick] = useState(0)

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

  const group = useMemo(() => {
    const parent = createGroupFromSymbol(symbol)
    if (!parent || !members) return parent
    const refs = members.split(',').map(s => s.trim()).filter(Boolean)
    const picked: GroupElement[] = refs
      .map(r => resolveEl(parent, r))
      .filter((e): e is GroupElement => e != null)
    if (!picked.some(e => e.id === parent.identity.id)) picked.push(parent.identity)
    if (picked.length < 2) return parent
    try {
      return buildSubgroupGroup(parent, picked, subgroup || parent.symbol)
    } catch {
      return parent
    }
  }, [symbol, members, subgroup])

  const isDark = theme ? theme === 'dark' : resolvedDark
  const bubbleTheme: 'dark' | 'light' = isDark ? 'dark' : 'light'

  // 字长球布局要求「中段元素在赤道上」那类几何一致性，缩放半径能整块映射。
  // 用 useMemo 提前存一份壳状态，避免在 JSX 里重复构造。
  const sphereActions = useMemo(
    () => (layout3D === 'wordLengthSphere' && group ? wordLengthSphereActions(group) : null),
    [layout3D, group],
  )
  const isWordLengthSphere = layout3D === 'wordLengthSphere' && sphereActions != null

  // layout3D：必须在引擎预设列表内才透传（写错的名字自动退回缺省形状）
  const layout3DProp = useMemo<Layout3D | undefined>(() => {
    if (!layout3D) return undefined
    return (LAYOUTS_3D as readonly string[]).includes(layout3D) ? (layout3D as Layout3D) : undefined
  }, [layout3D])

  // shape（2D）：同理，必须在 CAYLEY_SHAPES_2D 内才透传，写错退回缺省形状
  const shapeProp = useMemo<CayleyShape2D | undefined>(() => {
    if (!shape) return undefined
    return (CAYLEY_SHAPES_2D as readonly string[]).includes(shape)
      ? (shape as CayleyShape2D)
      : undefined
  }, [shape])

  // 逐生成元边长倍率：'元素引用=倍率' → 元素 id → 倍率。字长球布局边集被自动替换，不生效。
  const lengthScaleMap = useMemo(() => {
    if (!lengthScales || !group) return null
    const m = new Map<string, number>()
    for (const part of lengthScales.split(',')) {
      const eq = part.indexOf('=')
      if (eq < 0) continue
      const ref = part.slice(0, eq).trim()
      const v = Number(part.slice(eq + 1).trim())
      const el = resolveEl(group, ref)
      if (el && Number.isFinite(v) && v > 0) m.set(el.id, v)
    }
    return m.size ? m : null
  }, [lengthScales, group])

  // 作用的元素：接受 label / id / 循环记号，解析成引擎要的元素 id。
  // 未命中项丢弃（交给引擎用自己的生成元兜底）；actions 缺省则不传，行为与从前一致。
  const actionParams = useMemo(() => {
    if (!group) return undefined
    if (isWordLengthSphere) return sphereActions ?? undefined
    if (!actions) return undefined
    const refs = actions.split(',').map(s => s.trim()).filter(Boolean)
    const params = refs
      .map((ref, i): CayleyActionParam | null => {
        const el = resolveEl(group, ref)
        if (!el) return null
        const scale = lengthScaleMap?.get(el.id)
        return {
          elementId: el.id,
          enabled: true,
          color: COLOR_PALETTE[i % COLOR_PALETTE.length],
          ...(scale != null ? { lengthScale: scale } : {}),
        }
      })
      .filter((p): p is CayleyActionParam => p != null)
    return params.length ? params : undefined
  }, [group, actions, lengthScaleMap, isWordLengthSphere, sphereActions])

  // 路径高亮（VCL）：逗号分隔的元素引用序列，或 'sjt' 自动生成 SJT 哈密顿回路。
  const pathHighlight = useMemo<CayleyPathHighlight | null>(() => {
    if (!group || !path) return null
    const trimmed = path.trim()
    const refs =
      trimmed.toLowerCase() === 'sjt'
        ? sjtLabels(group)
        : trimmed.split(',').map((s) => s.trim()).filter(Boolean)
    if (refs.length < 2) return null
    return {
      elements: refs,
      ...(pathColor ? { color: pathColor } : {}),
      ...(pathWidth != null ? { width: pathWidth } : {}),
      ...(pathAnimate ? { animate: true } : {}),
      ...(pathShowOrder ? { showOrder: true } : {}),
    }
  }, [group, path, pathColor, pathWidth, pathAnimate, pathShowOrder])

  // 状态 / 平移缩放 / hover 全交给引擎（hostProps + sceneProps + hoverBubble）
  const state = useSceneState(
    group,
    useMemo(
      () => ({
        theme: bubbleTheme,
        fallbackViewBoxSize: { width: 560, height },
        // 乘法表是静态表格，不该被拖走/缩放（图形视图保留平移缩放）
        enablePan: view !== 'table',
        enableZoom: view !== 'table',
      }),
      [bubbleTheme, height, view],
    ),
  )
  const sceneProps = useMemo(
    () => (selectable ? state.sceneProps : { ...state.sceneProps, onSelect: () => {} }),
    [selectable, state.sceneProps],
  )

  // 凯莱图节点：引擎 nodeRadius 缺省 28 是绝对值（viewBox≈容器像素），
  // 桌面 ~750px 宽下节点视觉占比偏大，2D 里会盖住边。统一按实测宽度缩到
  // 约 2.7%（750→20、354→12），大屏封顶 22、下限 12；宽高未测量时不传。
  const vbWidth = state.viewBoxSize.width
  const isNarrow = vbWidth > 0 && vbWidth < 640
  const cayleyNodeRadius = useMemo(
    () => (vbWidth > 0 ? Math.min(22, Math.max(12, Math.round(vbWidth * 0.027))) : undefined),
    [vbWidth],
  )

  const isIdentityEl = (el: GroupElement | null) =>
    !!el && !!group && el.id === group.identity.id

  // 当前演示元素(操作台优先，其次 props.actionElement，最后自动兜底)
  const activeEl = useMemo<GroupElement | null>(() => {
    if (!group) return null
    if (picker && pickedId) {
      const fromPick = resolveEl(group, pickedId)
      if (fromPick) return fromPick
    }
    const fromProp = resolveEl(group, actionElement ?? null)
    if (fromProp) return fromProp
    // 自动兜底：首个非恒等 3 阶元，其次 2 阶元
    const order3 = group.elements.find(el => orderOf(group, el) === 3 && el.id !== group.identity.id)
    if (order3) return order3
    const order2 = group.elements.find(el => orderOf(group, el) === 2 && el.id !== group.identity.id)
    return order2 ?? null
  }, [group, picker, pickedId, actionElement])

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
      return pickerOrders ? ordersSet.has(orderOf(group, el)) : true
    })
    const byOrder = new Map<number, GroupElement[]>()
    for (const el of list) {
      const o = orderOf(group, el)
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

  const handlePick = (id: string) => {
    setPickedId(id)
    setReplayTick(t => t + 1)
  }
  const handleReplay = () => setReplayTick(t => t + 1)

  // 常驻标签默认策略
  const sceneShowLabels = showLabels ?? (view === 'set' || view === 'cayley3d' ? true : false)
  const isSymDemo = view === 'symmetry' && (symShowAction || picker)
  const hoverHint =
    view === 'table' && state.hovered && group
      ? `元素 ${state.hovered.label} · 阶 ${orderOf(group, state.hovered)}`
      : null
  const activeHint =
    hint ??
    hoverHint ??
    (isSymDemo && activeEl && group
      ? describeElement(activeEl, group.symbol, orderOf(group, activeEl))
      : isWordLengthSphere
        ? '拖动旋转 · 滚轮缩放 · 同色同字长（相邻对换下的最短生成元个数）'
        : DEFAULT_HINT[view])
  const themeAttr = theme ? { 'data-theme': theme } : {}

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
                      onClick={() => handlePick(el.id)}
                      title={describeElement(el, group.symbol, orderOf(group, el))}
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

      <div
        {...state.hostProps}
        className="gv-scene-host"
        style={{ ...state.hostProps.style, height }}
      >
        {group == null ? (
          <div className="gv-scene-empty">无法识别的群 symbol：{symbol}</div>
        ) : (
          <I18nProvider>
            {view === 'set' && (
              <SetView group={group} {...sceneProps} showLabels={sceneShowLabels} />
            )}
            {view === 'cycle' && <CycleView group={group} {...sceneProps} />}
            {view === 'cayley' && (
              <CayleyView
                group={group}
                {...sceneProps}
                showLabels={sceneShowLabels}
                actions={actionParams}
                multiplyType={multiplyType}
                nodeRadius={cayleyNodeRadius}
                edgeCurvature={edgeCurvature}
                shape2D={shapeProp}
                pathHighlight={pathHighlight}
              />
            )}
            {view === 'table' && <TableView group={group} {...sceneProps} cellSize={cellSize} />}
            {view === 'cayley3d' && (
              <Cayley3DScene
                group={group}
                selectedElements={state.selectedElements}
                onSelectElement={state.select}
                showLabels={sceneShowLabels}
                autoRotate={autoRotate}
                locked={locked}
                nodeScale={isWordLengthSphere ? undefined : (nodeScale ?? (isNarrow ? 0.7 : undefined))}
                layout3D={layout3DProp}
                actions={actionParams}
                multiplyType={multiplyType}
                pathHighlight={pathHighlight}
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
        )}

        {/* 悬停气泡：2D 图形视图由引擎按锚点就地渲染（乘法表无锚点，改在底部信息栏显示） */}
        {state.hoverBubble}
      </div>
      {meta && (
        <div className="gv-scene-meta">
          <span className="gv-scene-chip">
            {members && subgroup ? subgroup : symbol} · {isWordLengthSphere ? WORD_LENGTH_LABEL : VIEW_LABEL[view]}
          </span>
          {caption ? (
            <span className="gv-scene-caption" title={caption}>
              {caption}
            </span>
          ) : null}
          <span className="gv-scene-hint">{activeHint}</span>
        </div>
      )}
    </div>
  )
}
