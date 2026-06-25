import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{vue,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        card: 'hsl(var(--card))',
        'card-foreground': 'hsl(var(--card-foreground))',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        'type-fire': 'hsl(var(--type-fire))',
        'type-water': 'hsl(var(--type-water))',
        'type-wind': 'hsl(var(--type-wind))',
        'type-earth': 'hsl(var(--type-earth))',
        // Semantic palette — bare-channel oklch vars support /<alpha-value> modifiers.
        success: 'oklch(var(--success) / <alpha-value>)',
        warning: 'oklch(var(--warning) / <alpha-value>)',
        danger: 'oklch(var(--danger) / <alpha-value>)',
        info: 'oklch(var(--info) / <alpha-value>)',
        reserved: 'oklch(var(--reserved) / <alpha-value>)',
        gold: 'oklch(var(--gold) / <alpha-value>)',
        'success-strong': 'oklch(var(--success-strong) / <alpha-value>)',
        'warning-strong': 'oklch(var(--warning-strong) / <alpha-value>)',
        'danger-strong': 'oklch(var(--danger-strong) / <alpha-value>)',
        'info-strong': 'oklch(var(--info-strong) / <alpha-value>)',
        'reserved-strong': 'oklch(var(--reserved-strong) / <alpha-value>)',
        'gold-strong': 'oklch(var(--gold-strong) / <alpha-value>)',
        // Method-kind + state colors — distinct from the status palette.
        awakened: 'oklch(var(--awakened) / <alpha-value>)',
        garden: 'oklch(var(--garden) / <alpha-value>)',
        buy: 'oklch(var(--buy) / <alpha-value>)',
        machine: 'oklch(var(--machine) / <alpha-value>)',
        tool: 'oklch(var(--tool) / <alpha-value>)',
        'awakened-strong': 'oklch(var(--awakened-strong) / <alpha-value>)',
        'garden-strong': 'oklch(var(--garden-strong) / <alpha-value>)',
        'buy-strong': 'oklch(var(--buy-strong) / <alpha-value>)',
        'machine-strong': 'oklch(var(--machine-strong) / <alpha-value>)',
        'tool-strong': 'oklch(var(--tool-strong) / <alpha-value>)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Manrope', 'IBM Plex Sans', 'Segoe UI', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // Micro steps for data-dense planner/gantt/chip UI; xs+ keep Tailwind defaults.
        '3xs': ['0.625rem', { lineHeight: '0.875rem' }], // 10px — micro labels
        '2xs': ['0.6875rem', { lineHeight: '1rem' }], // 11px — dense data text
      },
      boxShadow: {
        card: '0 10px 40px -24px hsl(var(--accent) / 0.35)',
        glow: '0 0 0 1px hsl(var(--accent) / 0.35), 0 10px 28px -18px hsl(var(--accent) / 0.55)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 220ms ease-out',
      },
      maxWidth: {
        app: '1460px',
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config
