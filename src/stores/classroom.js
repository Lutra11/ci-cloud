/**
 * 课堂词云全局状态（纯前端 · 内存暂存，无后端、无 localStorage）
 *
 * 数据只保存在内存里（暂存），刷新页面即清空；
 * 跨标签页通过 BroadcastChannel 实时同步：
 *  - /cloud 与 /input 在同一个浏览器的不同标签页时，任一侧改动立即实时同步；
 *  - 新打开/刷新的标签页会广播一条「要快照」消息，已打开的标签页回传当前
 *    完整状态（相当于替代 localStorage 的初始化），保证后进入的页面也能
 *    拿到「已开始 / 已停止 / 已有词」等实时状态。
 *
 * 状态结构：
 *  phase   : 'idle' | 'running' | 'stopped'   —— 未开始 / 收集中 / 已停止
 *  entries : [{ id, name, words[], createdAt }]
 */
import { reactive, computed } from 'vue'

const CHANNEL_NAME = 'ci-cloud-sync'

export const PHASES = {
  IDLE: 'idle',
  RUNNING: 'running',
  STOPPED: 'stopped'
}

const state = reactive({
  phase: PHASES.IDLE,
  startedAt: null,
  stoppedAt: null,
  entries: []
})

// 每个标签页唯一的临时身份，用于「迟到加入」的握手（避免自己回复自己）
const tabId =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

let channel = null
try {
  channel = new BroadcastChannel(CHANNEL_NAME)
} catch {
  channel = null
}

/** 当前状态的深拷贝快照 */
function snapshot() {
  return JSON.parse(JSON.stringify(state))
}

/** 用一份快照整体替换本地状态（来自其他标签页广播） */
function apply(next) {
  if (!next || typeof next !== 'object') return
  state.phase = next.phase === PHASES.RUNNING || next.phase === PHASES.STOPPED ? next.phase : PHASES.IDLE
  state.startedAt = next.startedAt ?? null
  state.stoppedAt = next.stoppedAt ?? null
  state.entries = Array.isArray(next.entries) ? next.entries : []
}

function send(msg) {
  if (channel) {
    try {
      channel.postMessage(msg)
    } catch {
      /* 忽略广播失败 */
    }
  }
}

if (channel) {
  channel.onmessage = (e) => {
    const d = e.data
    if (!d || typeof d !== 'object') return

    if (d.type === 'state' && (!d.target || d.target === tabId)) {
      // 普通实时同步，或专门回复给本标签页的快照
      apply(d.state)
    } else if (d.type === 'request-state' && d.from !== tabId) {
      // 其他标签页刚打开/刷新，回传当前完整状态给它
      send({ type: 'state', target: d.from, state: snapshot() })
    }
  }
}

// 本标签页加载后立即向其他已打开的标签页要一份当前快照
send({ type: 'request-state', from: tabId })

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
export function startSession() {
  state.phase = PHASES.RUNNING
  state.startedAt = Date.now()
  state.stoppedAt = null
  send({ type: 'state', state: snapshot() })
}

/** 点击「停止」：关闭输入 */
export function stopSession() {
  state.phase = PHASES.STOPPED
  state.stoppedAt = Date.now()
  send({ type: 'state', state: snapshot() })
}

/** 点击「清空」：清空本轮全部词，并回到未开始状态 */
export function clearSession() {
  state.phase = PHASES.IDLE
  state.startedAt = null
  state.stoppedAt = null
  state.entries = []
  send({ type: 'state', state: snapshot() })
}

/**
 * 提交一条词：{ name, words[] }
 * 仅在 running 状态允许提交，词会自动去重、去空白。
 */
export function addEntry(name, words) {
  const cleanName = String(name ?? '').trim()
  const cleanWords = [...new Set((words || []).map((w) => String(w).trim()).filter(Boolean))]
  if (state.phase !== PHASES.RUNNING) {
    return { ok: false, message: '当前不在输入时段，无法提交' }
  }
  if (!cleanName) return { ok: false, message: '请先填写姓名' }
  if (!cleanWords.length) return { ok: false, message: '请至少添加一个词' }
  state.entries.push({
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: cleanName,
    words: cleanWords,
    createdAt: Date.now()
  })
  send({ type: 'state', state: snapshot() })
  return { ok: true }
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
