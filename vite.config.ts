import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'remove-tailwind-cdn',
      transformIndexHtml(html) {
        // 1. 移除引入 Tailwind CDN 的 script 标签
        // 这样在 Vite 环境下（开发或构建后），只使用本地编译的 CSS，不再加载 CDN
        let newHtml = html.replace(/<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/, '');
        
        // 2. 移除配套的 Tailwind 配置 script 块
        // 匹配包含 "tailwind.config =" 的整个 <script>...</script> 代码块
        newHtml = newHtml.replace(/<script>[\s\S]*?tailwind\.config\s*=[\s\S]*?<\/script>/, '');
        
        return newHtml;
      }
    }
  ],
  base: './', // 关键修改：设置基础路径为相对路径
})