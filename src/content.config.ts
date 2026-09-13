import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

/**
 * 引擎封面配置：GroupSceneProps 的可序列化子集。
 * 渲染侧（PostCover.astro）恒定强制：深色主题、锁定、不可交互、不显示说明栏——
 * 封面是「作者放上去、读者不可控」的图，这里不给交互类字段。
 */
const engineCoverSchema = z.object({
  symbol: z.string(),
  subgroup: z.string().optional(),
  members: z.string().optional(),
  view: z.enum(['set', 'cycle', 'cayley', 'cayley3d', 'table', 'symmetry']),
  /** 画布逻辑高度 px（详情页 hero 用，缺省 420） */
  height: z.number().optional(),
  showLabels: z.boolean().optional(),
  /** 3D 自动旋转（缺省 true，封面让它"活"着） */
  autoRotate: z.boolean().optional(),
  nodeScale: z.number().optional(),
  /** 3D 布局形状：引擎预设名（如 'truncatedTetrahedron'、S₄ 三生成元用 'truncatedOctahedron3'）；缺省按群自动选 */
  layout3D: z.string().optional(),
  cellSize: z.number().optional(),
  /** 逗号分隔的作用元素引用（如 '(12),(23),(34)'）；缺省用群缺省生成元 */
  actions: z.string().optional(),
  /** 逐生成元边长倍率：'元素引用=倍率' 逗号分隔（如 '(12)(34)=1.4,(234)=0.6'，倍率 0.3–3）；须与 actions 同用 */
  lengthScales: z.string().optional(),
  /** 2D 凯莱图边弯曲度倍率；0 = 笔直（如 S₃ 直边环），缺省 1 自适应弧 */
  edgeCurvature: z.number().optional(),
  multiplyType: z.enum(['right', 'left']).optional(),
  path: z.string().optional(),
  pathColor: z.string().optional(),
  pathWidth: z.number().optional(),
})

/**
 * 封面，三种写法：
 *   1. 字符串                 —— 图片/动图路径（public/ 下相对 base，如 'covers/x.png'）
 *   2. { img, alt? }          —— 图片 + 说明文字（alt，也用于 og:image）
 *   3. { engine, poster? }    —— 引擎活图；详情页渲染锁定不可交互的深色活图，
 *                                首页横卡用 poster 静态海报（png 截图），没给则渐变兜底
 * 路径统一相对 base（放 public/ 下，如 'covers/260909-a4.png'）。
 */
const coverSchema = z.union([
  z.string(),
  z
    .object({
      img: z.string().optional(),
      alt: z.string().optional(),
      engine: engineCoverSchema.optional(),
      poster: z.string().optional(),
    })
    .refine((v) => v.img != null || v.engine != null, {
      message: 'cover 对象需要 img 或 engine 至少其一',
    }),
])

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
    /** 封面/头图（首页横卡右侧 + 详情页 hero），见 coverSchema 注释 */
    cover: coverSchema.optional(),
  }),
})

export const collections = { blog }
