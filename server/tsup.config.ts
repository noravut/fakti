import { defineConfig } from 'tsup'

// bundle เพื่อให้ path alias `@shared/*` ถูก resolve ตอน build
// dependencies ทั้งหมดถูก mark external โดย default — node-pty เป็น native
// module จึงห้าม bundle เด็ดขาด
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  clean: true,
  sourcemap: true,
})
