import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// Custom plugin to copy Mediapipe WASM files to public/wasm
const mediapipeWasmPlugin = () => {
  return {
    name: 'mediapipe-wasm-copy',
    buildStart() {
      try {
        const source = path.resolve(__dirname, 'node_modules/@mediapipe/tasks-vision/wasm');
        const dest = path.resolve(__dirname, 'public/wasm');
        
        // Only attempt copy if source exists (e.g., packages installed via npm)
        if (fs.existsSync(source)) {
          console.log('📦 Copying Mediapipe WASM files to public/wasm...');
          if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
          }
          // Copy files recursively
          fs.cpSync(source, dest, { recursive: true });
        } else {
          console.warn('⚠️ Mediapipe source not found in node_modules. Skipping copy (CDN fallback will be used).');
        }
      } catch (e) {
        console.error('❌ Error copying Mediapipe WASM files:', e);
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mediapipeWasmPlugin()],
  base: './', // Keep relative base path for portability
})