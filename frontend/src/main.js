import { createApp } from 'vue'
import App from './App.vue'
import './styles/global.css'

// Element Plus 按需由 unplugin 注入；Message 等函数式 API 在 useToast 中单独引入样式
createApp(App).mount('#app')
