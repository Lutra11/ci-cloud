<script setup>
/**
 * /cloud —— 大屏词云页（教师端）
 *  - 「开始」：开放 /input 输入
 *  - 「停止」：锁定 /input 输入
 *  - 「清空」：清空本轮全部词，回到未开始状态
 *  - 二维码：指向本机 /input 路由
 */
import { ref, computed, watch, onMounted } from 'vue'
import QRCode from 'qrcode'
import WordCloudBoard from '../components/WordCloudBoard.vue'
import {
  phase,
  phaseLabel,
  entries,
  startSession,
  stopSession,
  clearSession,
  totalWords,
  uniqueWords
} from '../stores/classroom'

const confirmClear = ref(false)
let clearTimer = null
const qrSrc = ref('')

// 二维码固定指向本站 /input 路由：学生扫码即连同一个后端课堂，无需课堂码
const qrTarget = computed(() => {
  const dir = location.pathname.replace(/[^/]*$/, '')
  return `${location.origin}${dir}#/input`
})

onMounted(async () => {
  try {
    qrSrc.value = await QRCode.toDataURL(qrTarget.value, {
      width: 176,
      margin: 1,
      color: { dark: '#172c27', light: '#ffffff' }
    })
  } catch (e) {
    console.error('二维码生成失败', e)
  }
})

const stats = computed(() => ({
  people: entries.value.length,
  unique: uniqueWords(),
  total: totalWords()
}))

// 提交记录默认头像（public/avatar.png）
const avatarSrc = import.meta.env.BASE_URL + 'avatar.png'

// 提交记录列表：按最新在前排序，每页 3 条，左右按钮切换
const PAGE_SIZE = 3
const page = ref(1)
const sortedEntries = computed(() => [...entries.value].sort((a, b) => b.createdAt - a.createdAt))
const pageCount = computed(() => Math.max(1, Math.ceil(sortedEntries.value.length / PAGE_SIZE)))
const pageItems = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return sortedEntries.value.slice(start, start + PAGE_SIZE)
})
watch(pageCount, (n) => {
  if (page.value > n) page.value = n
})

function handleStart() {
  confirmClear.value = false
  clearTimeout(clearTimer)
  startSession()
}

function handleStop() {
  confirmClear.value = false
  clearTimeout(clearTimer)
  stopSession()
}

function handleClear() {
  if (!confirmClear.value) {
    // 第一步：按钮变为「确认清空全部词？」，3 秒内再点一次才执行
    confirmClear.value = true
    clearTimer = setTimeout(() => {
      confirmClear.value = false
    }, 3000)
    return
  }
  clearTimeout(clearTimer)
  confirmClear.value = false
  clearSession()
}
</script>

<template>
  <main class="shell">
    <header class="top">
      <div class="brand">
        <div class="brandmark">✳</div>
        <div>同频<small>CLASSROOM WORD CLOUD</small></div>
      </div>
      <div class="topright">
        <span class="subtle">课堂互动 · 实时词云</span>
        <span class="live" :class="phase"><i class="dot"></i>{{ phaseLabel }}</span>
      </div>
    </header>

    <div class="layout">
      <!-- 左侧控制台 -->
      <aside class="panel control">
        <div class="eyebrow">TEACHER DESK</div>
        <div class="title">课堂词云控制台</div>

        <button v-if="phase === 'idle'" class="primary" @click="handleStart">开始收集词云</button>
        <button v-else-if="phase === 'running'" class="primary stop" @click="handleStop">停止输入</button>
        <button v-else class="primary resume" @click="handleStart">重新开始</button>

        <button class="secondary danger" :class="{ confirming: confirmClear }" @click="handleClear">
          {{ confirmClear ? '确认清空全部词？' : '清空本轮词云' }}
        </button>

        <div class="divide"></div>

        <div class="eyebrow" style="margin-bottom: 12px">JOIN THE CLASS</div>
        <div class="qrwrap">
          <div class="qr" :class="{ idle: phase === 'idle' }">
            <img v-if="qrSrc" :src="qrSrc" alt="扫码进入输入页" />
          </div>
          <div class="qrtext">
            <strong>扫码提交词</strong>
            学生打开相机扫码<br />
            填写姓名与关键词
            <span v-if="phase === 'idle'" class="qrhint">开始后二维码才生效</span>
          </div>
        </div>
        <div class="divide"></div>

        <div class="subhead">
          <strong>提交记录</strong>
          <span class="count">{{ entries.length }} 人</span>
        </div>
        <div v-if="pageItems.length" class="sub-list">
          <div v-for="e in pageItems" :key="e.id" class="sub-row">
            <div class="sub-person">
              <img class="sub-avatar" :src="avatarSrc" alt="" />
              <span class="sub-name">{{ e.name }}</span>
            </div>
            <div class="sub-words">
              <span v-for="w in e.words" :key="w" class="sub-word">{{ w }}</span>
            </div>
          </div>
        </div>
        <span v-else class="emptyfeed">暂无提交，扫码输入后会显示在这里</span>
        <div v-if="pageCount > 1" class="sub-pager">
          <button class="pager-btn" :disabled="page <= 1" aria-label="上一页" @click="page--">‹</button>
          <span class="pager-info">{{ page }} / {{ pageCount }}</span>
          <button class="pager-btn" :disabled="page >= pageCount" aria-label="下一页" @click="page++">›</button>
        </div>
      </aside>

      <!-- 右侧词云大屏 -->
      <section>
        <div class="panel board">
          <div class="boardtop">
            <div>
              <span class="tasktag">课堂词云</span>
              <h1>大家的想法</h1>
              <div class="boarddesc">出现频率越高的词，字号越大</div>
            </div>
            <div class="stats">
              <div class="stat"><strong>{{ stats.people }}</strong><span>已提交人数</span></div>
              <div class="stat"><strong>{{ stats.unique }}</strong><span>关键词</span></div>
              <div class="stat"><strong>{{ stats.total }}</strong><span>词条总数</span></div>
            </div>
          </div>

          <div class="cloudarea">
            <WordCloudBoard :entries="entries" />
          </div>

          <div class="boardfoot">
            <span class="subtle">共收集 {{ stats.total }} 个词</span>
            <div class="legend">
              <span><i class="hot"></i>重复高频</span>
              <span><i class="mid"></i>已出现</span>
              <span><i class="new"></i>新观点</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.shell {
  max-width: 1280px;
  margin: auto;
  padding: 26px 44px 44px;
}

.top {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
}

.topright {
  display: flex;
  gap: 10px;
  align-items: center;
}

.layout {
  display: grid;
  grid-template-columns: 330px 1fr;
  gap: 22px;
  align-items: stretch;
}

.control {
  padding: 23px 22px;
}

.primary.stop {
  background: var(--danger);
}

.primary.stop:hover {
  background: #a84d37;
}

.primary.resume {
  background: #2f6f96;
}

.primary.resume:hover {
  background: #275d7f;
}

.secondary.danger {
  width: 100%;
  margin-top: 12px;
  border-color: transparent;
  background: #fdf0ec;
  color: var(--danger);
}

.secondary.danger:hover {
  background: #fbe3db;
}

.secondary.danger.confirming {
  background: var(--danger);
  color: #fff;
  border-color: var(--danger);
}

.qrwrap {
  display: flex;
  align-items: center;
  gap: 13px;
}

.qr {
  width: 112px;
  height: 112px;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 10px;
  display: grid;
  place-items: center;
  overflow: hidden;
  flex: none;
}

.qr img {
  width: 104px;
  height: 104px;
  display: block;
}

.qr.idle {
  opacity: 0.4;
  filter: grayscale(0.6);
}

.qrtext {
  font-size: 12px;
  line-height: 1.7;
  color: var(--muted);
}

.qrtext strong {
  display: block;
  color: var(--ink);
  font-size: 13px;
}

.qrhint {
  display: block;
  margin-top: 4px;
  color: var(--coral);
  font-weight: 700;
}

.board {
  min-height: 620px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.boardtop {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 25px 28px 0;
}

.tasktag {
  font-size: 10px;
  color: var(--green);
  background: #eaf4ee;
  border-radius: 6px;
  padding: 6px 9px;
  font-weight: 700;
}

.board h1 {
  font-size: 25px;
  letter-spacing: -0.8px;
  margin: 9px 0 5px;
}

.boarddesc {
  font-size: 12px;
  color: var(--muted);
}

.stats {
  display: flex;
  gap: 9px;
}

.stat {
  background: #f6f8f4;
  border: 1px solid #eef1ed;
  border-radius: 10px;
  padding: 10px 13px;
  min-width: 82px;
}

.stat strong {
  font-size: 19px;
  display: block;
  letter-spacing: -0.5px;
}

.stat span {
  font-size: 10px;
  color: var(--muted);
}

.cloudarea {
  flex: 1;
  min-height: 380px;
  position: relative;
  padding: 24px 32px;
}

.boardfoot {
  border-top: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
}

.legend {
  display: flex;
  gap: 14px;
  font-size: 10px;
  color: var(--muted);
}

.legend i {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 4px;
}

.legend .hot {
  background: var(--coral);
}

.legend .mid {
  background: var(--green);
}

.legend .new {
  background: var(--blue);
}

.subhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 13px;
}

.subhead strong {
  font-size: 13px;
}

.count {
  font-size: 10px;
  color: var(--muted);
  background: #f3f5f1;
  padding: 5px 9px;
  border-radius: 20px;
}

.sub-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.sub-row {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--line);
  background: #fafbf8;
  border-radius: 10px;
  padding: 9px 11px;
}

.sub-person {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  min-width: 92px;
}

.sub-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--line);
  background: #fff;
  flex: none;
}

.sub-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 56px;
}

.sub-words {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 0;
}

.sub-word {
  background: #eaf4ee;
  color: var(--green);
  border-radius: 12px;
  padding: 3px 9px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.sub-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-top: 13px;
}

.pager-btn {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  width: 30px;
  height: 30px;
  border-radius: 8px;
  font-size: 15px;
  line-height: 1;
  transition: background 0.15s;
}

.pager-btn:hover:not(:disabled) {
  background: #f2f5f1;
}

.pager-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.pager-info {
  font-size: 11px;
  color: var(--muted);
  font-weight: 700;
}

.emptyfeed {
  font-size: 11px;
  color: #a2aea7;
}

@media (max-width: 850px) {
  .shell {
    padding: 16px;
  }
  .layout {
    grid-template-columns: 1fr;
  }
  .board {
    grid-row: 1;
    min-height: 540px;
  }
  .control {
    grid-row: 2;
  }
  .boardtop {
    padding: 19px;
  }
  .board h1 {
    font-size: 21px;
  }
  .stats {
    gap: 5px;
  }
  .stat {
    min-width: 58px;
    padding: 8px;
  }
  .cloudarea {
    padding: 20px;
  }
  .boardfoot {
    padding: 12px;
  }
  .legend {
    gap: 8px;
  }
  .top {
    margin-bottom: 15px;
  }
  .subtle {
    display: none;
  }
}

@media (max-width: 440px) {
  .boardtop {
    display: block;
  }
  .stats {
    margin-top: 15px;
  }
  .board {
    min-height: 550px;
  }
  .cloudarea {
    min-height: 300px;
  }
  .boardfoot {
    align-items: flex-start;
    gap: 10px;
    flex-direction: column;
  }
}
</style>
