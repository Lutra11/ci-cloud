# 同频 · 课堂词云（Vue3 前端 + Node 后端）

课堂词云：学生手机扫码提交关键词，教师大屏**跨设备实时**渲染词云。

**架构**：前端（GitHub Pages 托管静态 SPA）+ 公网后端（GitHub Codespace 跑零依赖 `server.js`，REST + SSE）。

- 线上前端：<https://lutra11.github.io/ci-cloud/>
- 后端接口（公网）：<https://ci-cloud-backend-74q9j975qqgfrgx6-3000.app.github.dev/api/state>

## 路由

| 路由 | 用途 |
| --- | --- |
| `/cloud` | 大屏词云展示页（教师端）：开始 / 停止 / 清空、二维码、词云画布、提交记录 |
| `/input` | 学生输入页：姓名 + 关键词（可添加多个词） |

根路径 `/` 会自动跳转到 `/cloud`，其余未知路径也回到 `/cloud`。

## 后端接口（server.js，零依赖，`node server.js` 即跑）

| 方法与路径 | 说明 |
| --- | --- |
| `POST /api/input` | 学生提交 `{name: "张三", ciyu: ["创新","协作"]}`，仅 running 状态接受 |
| `POST /api/start` / `POST /api/stop` | 教师开始 / 停止收集 |
| `POST /api/clear` | 清除全部词语并复位到 idle |
| `GET /api/state` | 当前完整状态（phase / round / entries），迟到设备靠它补齐 |
| `GET /api/events` | SSE 实时推送（`state` / `entry` 两种事件，25s 心跳） |

CORS 全放行，前端与后端在不同域名下工作正常。

## 交互逻辑

1. 大屏打开 `/cloud`，点击 **「开始收集词云」** 后，`/input` 才被允许输入（开始前打开输入页会显示“课堂尚未开始”）。
2. 学生扫 `/cloud` 左侧的**二维码**进入 `/input`，填写姓名，逐个输入词并点 **「添加」**（可加多个词，回车也可添加），再点 **「提交词云」**。
3. 提交的词**实时**出现在 `/cloud` 词云中：**出现次数越多的词字号越大**（WordCloud2 按词频权重渲染）。
4. 点击 **「停止输入」** 后，`/input` 立即锁定，不再接受提交。
5. 点击 **「清空本轮词云」**（需连点两次确认）会清空全部提交，回到未开始状态。

## 本地开发

```bash
npm install          # 安装前端依赖
node server.js       # 起后端（另一个终端；缺省连 localhost:3000）
npm run dev          # 前端 dev server
```

前端默认连 `http://localhost:3000`；生产构建通过 `VITE_API_BASE` 注入公网后端地址（见 `.github/workflows/deploy.yml`）。

## 部署

- **前端**：push 到 main → GitHub Actions 自动 build 并部署 Pages。后端 URL 变更时只需改 `deploy.yml` 里的 `VITE_API_BASE`。
- **后端**：GitHub Codespace（本仓库已含 `.devcontainer/`，基于 javascript-node 镜像，postStartCommand 自动 `setsid` 拉起 server.js）。端口 3000 需设为 public：`gh codespace ports visibility -c <codespace名> 3000:public`。
- **注意**：Codespace 重启后端口可见性可能重置回 private，需重新执行上面命令；后端内存态在重启后清零（课堂开始前重启无影响）。

## 运维备忘

- Codespace 名：`ci-cloud-backend-74q9j975qqgfrgx6`（2核8G，SouthEastAsia 机房，idle-timeout 240 分钟）
- 免费额度：个人每月 120 核时 → 2 核机器 60 小时，单次课堂足够
- 状态查询：`gh codespace list --repo Lutra11/ci-cloud`
- 重启后端：`gh codespace stop -c <名>` 再从网页/CLI start，postStartCommand 会自动拉起
- e2e 测试：`node e2e-test.mjs`（默认本地，`BASE=https://lutra11.github.io/ci-cloud node e2e-test.mjs` 跑线上）

## 技术栈

- Vue 3（`<script setup>` 组合式 API）+ Pinia 风格 reactive store
- Vite 6 + @vitejs/plugin-vue
- vue-router 4（hash 模式，适配 Pages 静态托管）
- wordcloud（WordCloud2，canvas 词云渲染）
- qrcode（二维码生成）
- Node ≥ 18（后端，零依赖）
