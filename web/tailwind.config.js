/**
 * token ทั้งหมดยกมาจาก design doc ตรงๆ ห้ามเดาสีเอง
 * ค่าจริงอยู่ใน index.css เป็น CSS variable คู่ light/dark — ที่นี่อ้างถึงอย่างเดียว
 * ห้ามใช้ opacity modifier (bg-pine/10) กับสีพวกนี้ เพราะ var เก็บ hex ไม่ใช่ channel
 * ต้องการพื้นอ่อนให้ใช้ token -soft ที่ design doc เตรียมไว้แล้ว
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        paper: 'var(--paper)',
        raised: 'var(--raised)',
        line: 'var(--line)',
        hair: 'var(--hair)',
        hairline: 'var(--hairline)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        overlay: 'var(--overlay)',
        pine: {
          DEFAULT: 'var(--pine)',
          btn: 'var(--pine-btn)',
          'btn-hover': 'var(--pine-btn-hover)',
          soft: 'var(--pine-soft)',
          line: 'var(--pine-line)',
          on: 'var(--on-pine)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          btn: 'var(--danger-btn)',
          soft: 'var(--danger-soft)',
          line: 'var(--danger-line)',
        },
        warn: {
          DEFAULT: 'var(--warn)',
          soft: 'var(--warn-soft)',
          line: 'var(--warn-line)',
        },
        ok: {
          DEFAULT: 'var(--ok)',
          soft: 'var(--ok-soft)',
        },
        ring: 'var(--ring)',
        term: {
          bg: 'var(--term-bg)',
          fg: 'var(--term-fg)',
          dim: 'var(--term-dim)',
          ok: 'var(--term-ok)',
          ask: 'var(--term-ask)',
          user: 'var(--term-user)',
        },
      },
      fontFamily: {
        sans: 'var(--sans)',
        // JetBrains Mono ไม่มีสระ/พยัญชนะไทย --mono จึงต่อท้ายด้วยฟอนต์ไทยเสมอ
        mono: 'var(--mono)',
      },
      borderRadius: {
        DEFAULT: '6px',
        card: '8px',
        chip: '4px',
      },
      // ทุกค่าอยู่บน grid 4px ตาม §8 — เพิ่มเฉพาะขั้นที่ default scale ไม่มี
      spacing: {
        13: '52px',
        19: '76px',
        23: '92px',
        58: '232px',
        34: '136px',
        70: '280px',
        95: '380px',
        105: '420px',
        120: '480px',
        140: '560px',
        190: '760px',
      },
      height: {
        // §9: terminal ต้องสูง ≥ 540px บนจอ 1440×900 โดยไม่ต้องกดขยาย
        terminal: '60vh',
      },
      minHeight: {
        // §9: terminal ต้องสูง ≥ 540px บนจอ 1440×900 โดยไม่ต้องกดขยาย
        terminal: '60vh',
        dialog: '240px',
      },
      maxHeight: {
        list: '62vh',
      },
      maxWidth: {
        // G2: เนื้อหา fluid ไม่ตรึง 1000px อีก
        page: '1600px',
      },
    },
  },
  plugins: [],
}
