import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { storedAccent, storedTheme } from './theme'
import './style.css'

document.documentElement.setAttribute('data-theme', storedTheme())
document.documentElement.setAttribute('data-accent', storedAccent())

createApp(App).use(router).mount('#app')
