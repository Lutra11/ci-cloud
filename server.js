/**
 * ci-cloud 后端 —— 零依赖 Node HTTP 服务（node server.js，无需 npm install）
 *
 * 前端（GitHub Pages）与本服务分离部署。前端通过 REST + SSE 与本服务通信：
 *   POST /api/input   {name, ciyu:[...]}   学生提交词（仅在 running 状态）
 *   POST /api/clear                          教师清空全部词语（轮次+1，旧提交作废）
 *   POST /api/start                         教师开始收集
 *   POST /api/stop                          教师停止输入
 *   GET  /api/state                          获取完整状态（任何人）
 *   GET  /api/events                         SSE 实时推送（大屏订阅）
 *
 * 状态在内存中；SSE 下行实时推送，新加入页面用 GET /api/state 兜底。
 * 运行: PORT=3000 node server.js
 */
import http from 'node:http'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.PORT) || 3000

// 单课堂（全网共用一个词云）—— 起服务即重置为空闲
const state = {
  phase: 'idle', // idle | running | stopped
  round: 0,
  startedAt: null,
  stoppedAt: null,
  entries: [] // {id, name, words, createdAt}
}

const clients = new Set() // SSE 连接（大屏）
const now = () => Date.now()

function publicState() {
  return {
    phase: state.phase,
    round: state.round,
    startedAt: state.startedAt,
    stoppedAt: state.stoppedAt,
    entries: state.entries
  }
}

function broadcast(type, data) {
  const frame = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) {
    try {
      res.write(frame)
    } catch {
      clients.delete(res)
    }
  }
}

// ---- 请求体读取 + JSON 解析 ----
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > 64 * 1024) {
        reject(new Error('body too large'))
        req.destroy() // 防滥用：单请求最大 64KB
      } else {
        chunks.push(c)
      }
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch {
        resolve({}) // 非 JSON 一律当空对象，不炸服务
      }
    })
    req.on('error', reject)
  })
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
}

function json(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS_HEADERS
  })
  res.end(body)
}

const server = http.createServer(async (req, res) => {
  let url
  try {
    url = new URL(req.url, `http://localhost:${PORT}`)
  } catch {
    return json(res, 400, { ok: false, message: 'bad request' })
  }

  // CORS 预检（前端在 GitHub Pages，后端在 Codespace，跨域必须放行）
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    return res.end()
  }

  // ---- GET /api/state ----
  if (req.method === 'GET' && url.pathname === '/api/state') {
    return json(res, 200, { ok: true, ...publicState() })
  }

  // ---- GET /api/events (SSE) ----
  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    })
    res.write(`retry: 3000\n\n`)
    // 订阅即发送当前状态，保证后连上的页面立即拿到最新数据
    res.write(`event: state\ndata: ${JSON.stringify(publicState())}\n\n`)
    clients.add(res)
    // 心跳：每 25s 一行注释，防止中间层（反代/代理）掐掉空闲连接
    const iv = setInterval(() => {
      try {
        res.write(`: ping\n\n`)
      } catch {
        /* 已断开 */
      }
    }, 25 * 1000)
    req.on('close', () => {
      clearInterval(iv)
      clients.delete(res)
    })
    return
  }

  if (req.method !== 'POST') {
    return json(res, 404, { ok: false, message: 'not found' })
  }

  const body = await readBody(req)

  // POST /api/input —— 学生提交词 {name, ciyu:[...]}
  if (url.pathname === '/api/input') {
    // 兼容 ciyu / words 两种字段名（接口约定为 ciyu）
    const name = String(body.name ?? '').trim()
    const raw = body.ciyu ?? body.words ?? []
    const words = [...new Set(
      (Array.isArray(raw) ? raw : [raw])
        .map((w) => String(w ?? '').trim())
        .filter(Boolean)
    )].slice(0, 12) // 防滥用：单人单次最多 12 个词

    if (state.phase !== 'running') {
      return json(res, 200, { ok: false, message: '当前不在输入时段，无法提交' })
    }
    if (!name) return json(res, 200, { ok: false, message: '请先填写姓名' })
    if (!words.length) return json(res, 200, { ok: false, message: '请至少添加一个词' })

    const entry = {
      id: randomUUID(),
      name,
      words,
      createdAt: now()
    }
    state.entries.push(entry)
    broadcast('entry', { round: state.round, entry })
    return json(res, 200, { ok: true, entry })
  }

  // POST /api/clear —— 清空全部词语（轮次 +1，旧轮次在途提交会被丢弃）
  if (url.pathname === '/api/clear') {
    state.phase = 'idle'
    state.round += 1
    state.startedAt = null
    state.stoppedAt = null
    state.entries = []
    broadcast('state', publicState())
    return json(res, 200, { ok: true, ...publicState() })
  }

  // POST /api/start —— 开始收集
  if (url.pathname === '/api/start') {
    state.phase = 'running'
    state.startedAt = now()
    state.stoppedAt = null
    broadcast('state', publicState())
    return json(res, 200, { ok: true, ...publicState() })
  }

  // POST /api/stop —— 停止输入
  if (url.pathname === '/api/stop') {
    state.phase = 'stopped'
    state.stoppedAt = now()
    broadcast('state', publicState())
    return json(res, 200, { ok: true, ...publicState() })
  }

  return json(res, 404, { ok: false, message: 'not found' })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ci-cloud server listening on :${PORT}`)
})

// 优雅退出
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    console.log(`\n${sig} received, closing…`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 1500).unref()
  })
}
