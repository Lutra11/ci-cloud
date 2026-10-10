import { createRouter, createWebHashHistory } from 'vue-router'
import CloudView from '../views/CloudView.vue'
import InputView from '../views/InputView.vue'

const router = createRouter({
  // 使用 HTML5 History 模式，得到干净的 /cloud、/input 路径
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/cloud' },
    { path: '/cloud', name: 'cloud', component: CloudView },
    { path: '/input', name: 'input', component: InputView },
    // 其余路径统一回到大屏页
    { path: '/:pathMatch(.*)*', redirect: '/cloud' }
  ]
})

export default router
