/** token ทั้งหมดยกมาจาก design doc ตรงๆ ห้ามเดาสีเอง */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#E9E9E6',
        surface: '#FAFAF9',
        paper: '#FFFFFF',
        line: '#CBCBC7',
        hair: '#E5E5E2',
        hairline: '#F0F0EE',
        ink: '#16171B',
        muted: '#5C6068',
        faint: '#8E939C',
        pine: { DEFAULT: '#1F5F52', deep: '#17493F' },
        danger: '#A32E2E',
        warn: { DEFAULT: '#A66A0F', deep: '#7A4E0B' },
        term: { bg: '#16171B', dim: '#8E939C', norm: '#D6D8DC', ok: '#7CBFA5', ask: '#D9A44A', user: '#8FBFE8' },
      },
      fontFamily: {
        sans: ["'IBM Plex Sans Thai'", 'system-ui', 'sans-serif'],
        // JetBrains Mono ไม่มีสระ/พยัญชนะไทย ต้องมี IBM Plex Sans Thai ต่อท้าย
        // ไม่งั้นข้อความไทยในบรรทัด mono จะกลายเป็นกล่องเปล่า
        mono: ["'JetBrains Mono'", "'IBM Plex Sans Thai'", 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '6px',
        card: '8px',
        chip: '4px',
      },
      maxWidth: {
        page: '1000px',
      },
    },
  },
  plugins: [],
}
