import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'

const theme = localStorage.getItem('mvp-theme') || 'dark'
const accent = localStorage.getItem('mvp-accent') || 'blue'
document.documentElement.setAttribute('data-theme', theme)
document.documentElement.setAttribute('data-accent', accent)

createApp(App).use(router).mount('#app')
