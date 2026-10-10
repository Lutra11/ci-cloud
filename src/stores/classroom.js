/**
 * 课堂词云全局状态
 *
 * 同步机制（三层）：
 *  1. BroadcastChannel —— 同一浏览器不同标签页实时同步（本地开发 / 双屏模式）
 *  2. ntfy.sh 公共消息服务 —— 跨设备同步（教师大屏 ↔ 学生手机）：
 *     - 教师页（/cloud）生成课堂码 room，二维码地址携带 ?room=xxx
 *     - 所有页面订阅同一个主题 cicloud-<room>（SSE，since=all 回放最新状态）
 *     - 教师：开始/停止/清空 → 广播 phase 消息；学生：提交 → 广播 entry 消息
 *  3. localStorage（仅教师页）—— 课堂码与课堂状态持久化，教师刷新页面不丢数据、
 *     二维码不变；学生端不持久化，扫一次码拿一次最新状态。
 *
 * 状态结构：
 *  room    : 课堂码（6 位），师生凭它连到同一条消息通道
 *  round   : 轮次，清空时 +1，旧轮次的提交一律丢弃
 *  phase   : 'idle' | 'running' | 'stopped' —— 未开始 / 收集中 / 已停止
 *  entries : [{ id, name, words[], createdAt }]
 */
import { reactive, computed } from 'vue'

const CHANNEL_NAME = 'ci-cloud-sync'
const NTFY = 'https://ntfy.sh'

export const PHASES = {
  IDLE: 'idle',
  RUNNING: 'running',
  STOPPED: 'stopped'
}

// 每个标签页唯一身份，避免处理自己发出的消息
const tabId =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

// ---- 课堂码 ----
function randomRoom() {
  let s = ''
  while (s.length < 6) s += Math.random().toString(36).slice(2, 8)
  return s.slice(0, 6)
}
function roomFromUrl() {
  const m = location.hash.match(/[?&]room=([A-Za-z0-9]+)/)
  return m ? m[1] : ''
}
// /cloud（含根路径重定向）= 教师端；/input = 学生端
const isTeacher = !/#\/input\b/.test(location.hash)

// 教师：课堂码固定存 localStorage（刷新不变，学生手里的二维码不失效）
// 学生：从二维码 URL 里取课堂码；直接手输网址没带码时用默认演示码
const room = isTeacher
  ? localStorage.getItem('ci-cloud-room') || randomRoom()
  : roomFromUrl() || 'demo'
if (isTeacher) localStorage.setItem('ci-cloud-room', room)

const TOPIC = `cicloud-${room}`
const STORE_KEY = `ci-cloud-state-${room}`

const state = reactive({
  room,
  round: 0,
  phase: PHASES.IDLE,
  startedAt: null,
  stoppedAt: null,
  entries: []
})

// ---- 本地持久化（仅教师页：刷新后课堂码、状态、词都不丢）----
function persist() {
  if (!isTeacher) return
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        round: state.round,
        phase: state.phase,
        startedAt: state.startedAt,
        stoppedAt: state.stoppedAt,
        entries: state.entries
      })
    )
  } catch {
    /* 存储失败忽略 */
  }
}
if (isTeacher) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
    if (saved && typeof saved === 'object') applyLocal(saved)
  } catch {
    /* 忽略损坏的存档 */
  }
}
function applyLocal(next) {
  if (!next || typeof next !== 'object') return
  state.phase =
    next.phase === PHASES.RUNNING || next.phase === PHASES.STOPPED ? next.phase : PHASES.IDLE
  state.startedAt = next.startedAt ?? null
  state.stoppedAt = next.stoppedAt ?? null
  state.entries = Array.isArray(next.entries) ? next.entries : []
  state.round = Number(next.round) || 0
}

// ---- 同浏览器标签页同步（BroadcastChannel）----
let channel = null
try {
  channel = new BroadcastChannel(CHANNEL_NAME)
} catch {
  channel = null
}

function sendLocal(msg) {
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
    if (d.type === 'state') {
      applyLocal(d.state)
    } else if (d.type === 'request-state' && d.from !== tabId) {
      sendLocal({ type: 'state', state: snapshot() })
    }
  }
}
// 本标签页加载后向其他标签页要一份当前快照（仅同浏览器；跨设备走 ntfy 回放）
sendLocal({ type: 'request-state', from: tabId })

// ---- 跨设备同步（ntfy.sh）----
function remoteSend(payload) {
  try {
    fetch(NTFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 注意：ntfy 的 JSON 发布格式必须 POST 到根 URL，topic 放 body 里；
      // 若 POST 到 /<topic> 且带 JSON body，整个 body 会被当成纯文本消息（双层嵌套）
      body: JSON.stringify({
        topic: TOPIC,
        message: JSON.stringify({ ...payload, from: tabId })
      })
    }).catch(() => {
      /* 离线/网络失败忽略 */
    })
  } catch {
    /* 忽略 */
  }
}

function handleRemote(p) {
  if (!p || typeof p !== 'object' || p.from === tabId) return
  if (p.t === 'phase') {
    state.phase =
      p.phase === PHASES.RUNNING || p.phase === PHASES.STOPPED ? p.phase : PHASES.IDLE
    // 轮次变化说明教师清空过，旧词全部作废
    if (Number(p.round) !== state.round) {
      state.round = Number(p.round) || 0
      state.entries = []
    }
    state.startedAt = p.startedAt ?? null
    state.stoppedAt = p.stoppedAt ?? null
    persist()
  } else if (p.t === 'entry') {
    const entry = p.entry
    if (
      Number(p.round) === state.round &&
      entry &&
      entry.id &&
      !state.entries.some((x) => x.id === entry.id)
    ) {
      state.entries.push(entry)
      persist()
    }
  }
}

// 订阅消息通道；since=all 让晚加入的手机回放拿到最新课堂状态
try {
  const es = new EventSource(`${NTFY}/${TOPIC}/sse?since=all`)
  es.onmessage = (ev) => {
    try {
      const env = JSON.parse(ev.data)
      if (env.event !== 'message' || !env.message) return
      handleRemote(JSON.parse(env.message))
    } catch {
      /* 非 JSON 消息忽略 */
    }
  }
} catch {
  /* 不支持 EventSource 时退化为本地模式 */
}

// ---- 工具 ----
function snapshot() {
  return JSON.parse(JSON.stringify(state))
}

function phasePayload() {
  return {
    t: 'phase',
    round: state.round,
    phase: state.phase,
    startedAt: state.startedAt,
    stoppedAt: state.stoppedAt
  }
}

// ---- 只读派生状态 ----
export function getRoom() {
  return state.room
}
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
  sendLocal({ type: 'state', state: snapshot() })
  remoteSend(phasePayload())
  persist()
}

/** 点击「停止」：关闭输入 */
export function stopSession() {
  state.phase = PHASES.STOPPED
  state.stoppedAt = Date.now()
  sendLocal({ type: 'state', state: snapshot() })
  remoteSend(phasePayload())
  persist()
}

/** 点击「清空」：清空本轮全部词，轮次 +1（旧轮次的在途提交会被丢弃），回到未开始 */
export function clearSession() {
  state.phase = PHASES.IDLE
  state.startedAt = null
  state.stoppedAt = null
  state.entries = []
  state.round = state.round + 1
  sendLocal({ type: 'state', state: snapshot() })
  remoteSend(phasePayload())
  persist()
}

/**
 * 提交一条词：{ name, words[] }
 * 仅在 running 状态允许提交，词会自动去重、去空白。
 * 学生手机上的提交通过消息通道实时送到教师大屏。
 */
export function addEntry(name, words) {
  const cleanName = String(name ?? '').trim()
  const cleanWords = [...new Set((words || []).map((w) => String(w).trim()).filter(Boolean))]
  if (state.phase !== PHASES.RUNNING) {
    return { ok: false, message: '当前不在输入时段，无法提交' }
  }
  if (!cleanName) return { ok: false, message: '请先填写姓名' }
  if (!cleanWords.length) return { ok: false, message: '请至少添加一个词' }
  const entry = {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: cleanName,
    words: cleanWords,
    createdAt: Date.now()
  }
  state.entries.push(entry)
  sendLocal({ type: 'state', state: snapshot() })
  remoteSend({ t: 'entry', round: state.round, entry })
  persist()
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
