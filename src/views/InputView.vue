<script setup>
/**
 * /input —— 学生输入页
 *  - 未开始（idle）    ：锁定，提示等待教师点击「开始」，开始后本页自动解锁
 *  - 收集中（running） ：姓名 + 词，可添加多个词，提交后进入词云
 *  - 已停止（stopped） ：锁定，不再接受提交
 * 状态为全局响应式，教师在大屏操作后本页会实时变化。
 */
import { ref, computed } from 'vue'
import { phase, addEntry } from '../stores/classroom'

const name = ref('')
const wordInput = ref('')
const words = ref([])
const errorMsg = ref('')
const submitted = ref(false)
const lastEntry = ref(null)

const canSubmit = computed(() => name.value.trim().length > 0 && words.value.length > 0)

function addWord() {
  const w = wordInput.value.trim()
  wordInput.value = ''
  if (!w) return
  if (!words.value.includes(w)) words.value.push(w)
}

function removeWord(index) {
  words.value.splice(index, 1)
}

function submit() {
  const res = addEntry(name.value, words.value)
  if (!res.ok) {
    errorMsg.value = res.message
    return
  }
  errorMsg.value = ''
  lastEntry.value = { name: name.value.trim(), words: [...words.value] }
  submitted.value = true
  name.value = ''
  words.value = []
}

function again() {
  submitted.value = false
  lastEntry.value = null
  errorMsg.value = ''
}
</script>

<template>
  <main class="student">
    <div class="brand">
      <div class="brandmark">✳</div>
      <div>同频<small>CLASSROOM WORD CLOUD</small></div>
    </div>

    <section class="panel">
      <!-- 未开始：锁定 -->
      <div v-if="phase === 'idle'" class="blocked idle">
        <div class="orb">✳</div>
        <h2>课堂尚未开始</h2>
        <p>教师还没有在大屏点击「开始」。<br />页面会自动解锁，请稍候。</p>
        <router-link class="backlink" to="/cloud">返回大屏 →</router-link>
      </div>

      <!-- 已停止：锁定 -->
      <div v-else-if="phase === 'stopped'" class="blocked stopped">
        <div class="orb">⏸</div>
        <h2>本轮输入已停止</h2>
        <p>教师已经停止收集，本页不再接受提交。</p>
        <router-link class="backlink" to="/cloud">返回大屏 →</router-link>
      </div>

      <!-- 收集中 · 提交成功 -->
      <div v-else-if="submitted" class="success">
        <div class="orb">✓</div>
        <h2>提交成功</h2>
        <p>
          {{ lastEntry.name }} 的 {{ lastEntry.words.length }} 个词已出现在大屏词云中。
        </p>
        <button class="secondary" @click="again">再提交一次</button>
      </div>

      <!-- 收集中 · 输入表单 -->
      <form v-else class="form" @submit.prevent="submit">
        <div class="eyebrow">课堂互动 · 提交词</div>
        <div class="statuscard">
          <small>当前状态</small>
          <h2>词云正在收集中</h2>
          <p>填写姓名，并输入你想到的关键词。词越受大家认同，在大屏上的字号就越大。</p>
        </div>

        <h3>你的姓名</h3>
        <input v-model="name" class="field" placeholder="例如：李同学" maxlength="20" />

        <h3>关键词</h3>
        <div class="wordrow">
          <input
            v-model="wordInput"
            class="field"
            placeholder="输入一个词，如：奋斗"
            maxlength="20"
            @keyup.enter="addWord"
          />
          <button type="button" class="secondary" @click="addWord">添加</button>
        </div>

        <div v-if="words.length" class="chips">
          <span v-for="(w, i) in words" :key="w" class="chip">
            {{ w }}
            <button type="button" :aria-label="`移除 ${w}`" @click="removeWord(i)">✕</button>
          </span>
        </div>

        <div class="err">{{ errorMsg }}</div>

        <button type="submit" class="primary" :disabled="!canSubmit">提交词云 ↗</button>
        <div class="tip">已添加 {{ words.length }} 个词 · 点击「添加」可继续加入，提交后自动去重。</div>
      </form>
    </section>
  </main>
</template>

<style scoped>
.student {
  max-width: 560px;
  margin: 9vh auto;
  padding: 0 20px;
}

.student .panel {
  padding: 28px;
}

.student .brand {
  margin-bottom: 34px;
}

.student h3 {
  font-size: 16px;
  margin: 0;
}

.student .field {
  margin-top: 7px;
}

.form .statuscard {
  background: #f5f7f2;
  border-radius: 13px;
  padding: 16px;
  margin: 16px 0 20px;
}

.statuscard small {
  color: var(--green);
  font-weight: 700;
  font-size: 10px;
  letter-spacing: 1px;
}

.statuscard h2 {
  font-size: 21px;
  margin: 8px 0 5px;
}

.statuscard p {
  font-size: 13px;
  color: #6f7d75;
  line-height: 1.6;
  margin: 0;
}

.wordrow {
  display: flex;
  gap: 8px;
  margin-top: 7px;
}

.wordrow .field {
  flex: 1;
}

.wordrow .secondary {
  flex: none;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #eaf4ee;
  color: #176b54;
  border-radius: 16px;
  padding: 5px 6px 5px 11px;
  font-size: 12px;
  font-weight: 600;
}

.chip button {
  border: 0;
  background: transparent;
  color: #176b54;
  font-size: 13px;
  line-height: 1;
  padding: 0 3px;
  opacity: 0.7;
}

.chip button:hover {
  opacity: 1;
}

.err {
  color: var(--danger);
  font-size: 12px;
  margin-top: 10px;
  min-height: 16px;
}

.success {
  text-align: center;
  padding: 30px 10px;
}

.success .orb {
  margin: auto auto 16px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #e5f3e8;
  color: #29734f;
  display: grid;
  place-items: center;
  font-size: 25px;
}

.success h2 {
  font-size: 20px;
}

.success p {
  font-size: 13px;
  color: var(--muted);
}

.blocked {
  text-align: center;
  padding: 40px 10px;
}

.blocked .orb {
  margin: auto auto 16px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 25px;
}

.blocked.idle .orb {
  background: #f0f2ee;
  color: #7b8983;
}

.blocked.stopped .orb {
  background: #fdf0ec;
  color: var(--danger);
}

.blocked h2 {
  font-size: 19px;
  margin: 0 0 6px;
}

.blocked p {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
}

.backlink {
  display: inline-block;
  margin-top: 16px;
  color: var(--green);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
}

.backlink:hover {
  text-decoration: underline;
}

@media (max-width: 440px) {
  .student {
    margin: 4vh auto;
  }
}
</style>
