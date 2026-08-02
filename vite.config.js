import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

// 自定义插件：构建后移除 script/link 标签的 crossorigin 属性
// 在 file:// 协议下，crossorigin 会触发 CORS 检查导致资源加载失败（白屏）
function removeCrossOrigin() {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin/g, '')
    }
  }
}

export default defineConfig({
  plugins: [
    vue(),
    removeCrossOrigin(),
    electron([
      {
        entry: 'electron/main/index.js',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['electron', 'maxmind', 'electron-updater']
            }
          }
        }
      },
      {
        entry: 'electron/preload/index.cjs',
        onstart({ reload }) {
          reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: {
              output: {
                entryFileNames: 'index.cjs',
                format: 'cjs'
              },
              external: ['electron']
            }
          }
        }
      }
    ]),
    renderer()
  ],
  server: {
    port: 5174
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 使用 terser 代替 esbuild 压缩，避免 esbuild 的 TDZ (Temporal Dead Zone) 问题
    // esbuild 在压缩时会重排 const 声明顺序，导致 "Cannot access 'X' before initialization" 错误
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
        drop_debugger: true
      }
    }
  }
})
