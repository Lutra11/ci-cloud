/**
 * 课堂词云全局状态（后端同步版）
 *
 * 数据源是公网后端（server.js，部署于 Codespace）：
 *  - GET  /api/state   页面打开时拉一次当前课堂状态（含历史词）
 *  - GET  /api/events   SSE 实时通道：state（开始/停止/清空）与 entry（新提交）
 *  - POST /api/input    学生提交词 {name, ciyu:[...]}
 *  - POST /api/start|stop|clear   教师操作
 *
 * 所有设备（教师大屏 + 学生手机）都直接连后端，天然跨设备实时同步。
 * API 地址在构建时通过 VITE_API_BASE 注入；缺省 localhost 用于本地开发。
 */
import { reactive, computed } from 'vue'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:3000'

export const PHASES = {
  IDLE: 'idle',
  RUNNING: 'running',
  STOPPED: 'stopped'
}

const state = reactive({
  phase: PHASES.IDLE,
  round: 0,
  startedAt: null,
  stoppedAt: null,
  entries: []
})

// ---- 状态应用（幂等：同一状态重复应用无副作用）----
function applyState(s) {
  if (!s || typeof s !== 'object') return
  state.phase =
    s.phase === PHASES.RUNNING || s.phase === PHASES.STOPPED ? s.phase : PHASES.IDLE
  state.round = Number(s.round) || 0
  state.startedAt = s.startedAt ?? null
  state.stoppedAt = s.stoppedAt ?? null
  state.entries = Array.isArray(s.entries) ? s.entries : []
}

function pushEntry(entry, round) {
  if (
    entry &&
    entry.id &&
    Number(round) === state.round &&
    !state.entries.some((x) => x.id === entry.id)
  ) {
    state.entries.push(entry)
  }
}

async function post(path, body) {
  try {
    const r = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    return await r.json()
  } catch {
    return { ok: false, message: '网络异常，请稍后再试' }
  }
}

// ---- 启动：拉一次状态 + 订阅 SSE ----
async function bootstrap() {
  try {
    const r = await fetch(`${API}/api/state`)
    applyState(await r.json())
  } catch {
    /* 后端暂不可达：保持未开始，SSE 会自动重连 */
  }
  try {
    const es = new EventSource(`${API}/api/events`)
    es.addEventListener('state', (ev) => {
      try {
        applyState(JSON.parse(ev.data))
      } catch {
        /* 非 JSON 忽略 */
      }
    })
    es.addEventListener('entry', (ev) => {
      try {
        const d = JSON.parse(ev.data)
        pushEntry(d.entry, d.round)
      } catch {
        /* 非 JSON 忽略 */
      }
    })
  } catch {
    /* 浏览器不支持 EventSource：靠下面轮询兜底 */
  }

  // 低频兜底轮询：只在阶段与当前不一致时应用，避免覆盖刚收到的 SSE 新词
  setInterval(async () => {
    try {
      const r = await fetch(`${API}/api/state`)
      const d = await r.json()
      if (d && d.phase && d.phase !== state.phase) applyState(d)
    } catch {
      /* 忽略 */
    }
  }, 30 * 1000)
}
bootstrap()

// ---- 只读派生状态 ----
export const phase = computed(() => state.phase)
export const entries = computed(() => state.entries)
export const isRunning = computed(() => state.phase === PHASES.RUNNING)

export const phaseLabel = computed(() => {
  if (state.phase === PHASES.RUNNING) return '正在进行'
  if (state.phase === PHASES.STOPPED) return '已停止'
  return '未开始'
})

// ---- 操作方法 ----

/** 点击「开始」：开放输入（只有 running 状态下 /input 才允许提交） */
export async function startSession() {
  // 乐观更新：点击立即生效，随后 POST / SSE 校准
  state.phase = PHASES.RUNNING
  state.startedAt = Date.now()
  state.stoppedAt = null
  const d = await post('/api/start')
  if (d && d.phase) applyState(d)
}

/** 点击「停止」：关闭输入 */
export async function stopSession() {
  state.phase = PHASES.STOPPED
  state.stoppedAt = Date.now()
  const d = await post('/api/stop')
  if (d && d.phase) applyState(d)
}

/** 点击「清空」：清空本轮全部词，轮次 +1（旧轮次在途提交会被丢弃），回到未开始 */
export async function clearSession() {
  state.phase = PHASES.IDLE
  state.startedAt = null
  state.stoppedAt = null
  state.entries = []
  state.round += 1
  const d = await post('/api/clear')
  if (d && d.phase) applyState(d)
}

/**
 * 提交一条词：{ name, words[] }
 * 先本地校验给即时反馈，再 POST 到后端；失败返回 { ok:false, message }。
 */
export async function addEntry(name, words) {
  const cleanName = String(name ?? '').trim()
  const cleanWords = [...new Set((words || []).map((w) => String(w).trim()).filter(Boolean))]
  if (state.phase !== PHASES.RUNNING) {
    return { ok: false, message: '当前不在输入时段，无法提交' }
  }
  if (!cleanName) return { ok: false, message: '请先填写姓名' }
  if (!cleanWords.length) return { ok: false, message: '请至少添加一个词' }

  const d = await post('/api/input', { name: cleanName, ciyu: cleanWords })
  if (d && d.ok && d.entry) {
    pushEntry(d.entry, state.round)
  }
  return { ok: !!(d && d.ok), message: (d && d.message) || '' }
}

// ---- 词云数据 ----

/** 统计每个词的出现次数（词频），按次数降序 */
export function wordFrequency() {
  const counts = {}
  for (const e of state.entries) {
    for (const w of e.words || []) {
      counts[w] = (counts[w] || 0) + 1
    }
  }
  return Object.entries(counts)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
}

/** 全部词条总数 */
export function totalWords() {
  return state.entries.reduce((n, e) => n + (e.words || []).length, 0)
}

/** 去重后的词数 */
export function uniqueWords() {
  return wordFrequency().length
}
