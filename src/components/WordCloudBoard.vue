<script setup>
/**
 * 词云画布组件
 * 基于第三方库 wordcloud（WordCloud2）在 canvas 上渲染词云。
 * 词的权重 = 出现次数，次数越多字号越大（wordcloud 按权重自动映射字号）。
 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import WordCloud from 'wordcloud'
import { wordFrequency } from '../stores/classroom'

const props = defineProps({
  entries: { type: Array, default: () => [] }
})

const wrapRef = ref(null)
const canvasRef = ref(null)
let resizeTimer = null

const PALETTE = ['#176b54', '#7a9ce2', '#e17b63', '#a187cf', '#ca9e30', '#509b7a']

function renderCloud() {
  const canvas = canvasRef.value
  const wrap = wrapRef.value
  if (!canvas || !wrap) return

  // 按设备像素比初始化画布，保证大屏清晰
  const dpr = window.devicePixelRatio || 1
  const width = wrap.clientWidth || 600
  const height = wrap.clientHeight || 420
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const freq = wordFrequency()
  if (!freq.length) {
    try {
      WordCloud.stop()
    } catch {
      /* 无动画在跑，忽略 */
    }
    return
  }

  const max = Math.max(...freq.map((f) => f.count))
  // 目标字号：词频越高字号越大（18px ~ 80px 区间）
  const sizeFor = (w) => Math.max(16, Math.min(80, 18 + (w / max) * 62))

  try {
    WordCloud.stop()
  } catch {
    /* 忽略 */
  }

  WordCloud(canvas, {
    list: freq.map((f) => [f.word, f.count]),
    gridSize: 6,
    // wordcloud 的 weightMode='size' 时：字号 = 权重 × weightFactor，
    // 因此令 weightFactor = 目标字号 / 权重，即可精确控制每个词的字号
    weightFactor: (w) => sizeFor(w) / w,
    fontFamily: '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif',
    fontWeight: 700,
    color: () => PALETTE[Math.floor(Math.random() * PALETTE.length)],
    backgroundColor: 'rgba(0,0,0,0)',
    rotateRatio: 0.3,
    minSize: 12,
    ellipticity: 0.72,
    shape: 'circle',
    shrinkToFit: true,
    drawOutOfBound: 'discard'
  })
}

function scheduleRender() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(renderCloud, 120)
}

watch(
  () => props.entries,
  () => scheduleRender(),
  { deep: true }
)

onMounted(() => {
  renderCloud()
  window.addEventListener('resize', scheduleRender)
})

onBeforeUnmount(() => {
  clearTimeout(resizeTimer)
  window.removeEventListener('resize', scheduleRender)
  try {
    WordCloud.stop()
  } catch {
    /* 忽略 */
  }
})
</script>

<template>
  <div ref="wrapRef" class="cloud-board">
    <canvas ref="canvasRef" class="cloud-canvas"></canvas>
    <div v-if="!entries.length" class="placeholder">
      <div class="orb">✳</div>
      <strong>词云正在等待第一个词</strong>
      <span>点击「开始」并扫码进入输入页，让想法在这里相遇</span>
    </div>
  </div>
</template>

<style scoped>
.cloud-board {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 380px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cloud-canvas {
  display: block;
  max-width: 100%;
}

.placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #a0aca5;
  pointer-events: none;
}

.placeholder .orb {
  margin: 0 auto 15px;
  width: 60px;
  height: 60px;
  border-radius: 22px;
  background: #f2f6e2;
  display: grid;
  place-items: center;
  color: var(--green);
  font-size: 25px;
}

.placeholder strong {
  display: block;
  color: #65766d;
  font-size: 14px;
  margin-bottom: 5px;
}

.placeholder span {
  font-size: 12px;
}
</style>
