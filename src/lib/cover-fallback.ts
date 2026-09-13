/**
 * 封面渐变兜底（确定性）：同一 seed 永远同一配色。
 *
 * 两个消费方：
 *  - PostCover.astro   首页横卡 / 详情页 hero 无封面时占位 → 用 `css`
 *  - ShareBar.tsx      分享图 canvas 无封面时重画 → 用 `hue` / `hue2`
 *
 * canvas 侧按同结构近似重画三层（linear 底 + 两枚 radial 亮斑），
 * 椭圆半径做圆形近似，视觉一致即可，不必像素级相同。
 */
export interface CoverFallback {
  hue: number
  hue2: number
  /** CSS background 值（多层渐变叠加） */
  css: string
}

export function coverFallback(seed: string): CoverFallback {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  const hue = hash % 360
  const hue2 = (hue + 46) % 360
  const css = [
    `radial-gradient(120% 170% at 82% 26%, hsl(${hue2} 60% 46% / 0.92), hsl(${hue2} 60% 46% / 0) 62%)`,
    `radial-gradient(90% 130% at 55% 88%, hsl(${hue} 55% 40% / 0.55), hsl(${hue} 55% 40% / 0) 58%)`,
    `linear-gradient(to left, hsl(${hue} 46% 27%) 18%, hsl(${hue} 46% 27% / 0) 82%)`,
  ].join(', ')
  return { hue, hue2, css }
}
