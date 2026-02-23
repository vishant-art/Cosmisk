/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        cream: '#F7F8FA',
        dark: '#0C0C14',
        navy: { DEFAULT: '#1A1A2E', hover: '#2A2A3E', light: '#2A2A4E' },
        accent: { DEFAULT: '#6366F1', hover: '#4F46E5', light: '#EEF2FF' },
        border: '#E3E5EB',
        divider: '#ECEEF3',
        'input-bg': '#F1F3F7',
        'code-bg': '#F3F4F8',
        dna: {
          'hook-bg': '#FEF3C7', 'hook-text': '#92400E',
          'visual-bg': '#DBEAFE', 'visual-text': '#1E40AF',
          'audio-bg': '#D1FAE5', 'audio-text': '#065F46',
        },
        chart: {
          1: '#6366F1', 2: '#3B82F6', 3: '#10B981', 4: '#F59E0B',
          5: '#8B5CF6', 6: '#EC4899', 7: '#14B8A6', 8: '#F97316',
        },
      },
      fontFamily: {
        serif: ['Playfair Display', 'serif'],
        display: ['DM Sans', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        card: '12px',
        modal: '16px',
        pill: '20px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
        'card-hover': '0 8px 24px rgba(0,0,0,0.08)',
        modal: '0 25px 50px rgba(0,0,0,0.25)',
        dropdown: '0 4px 16px rgba(0,0,0,0.12)',
        button: '0 1px 2px rgba(0,0,0,0.05)',
        glow: '0 0 20px rgba(99, 102, 241, 0.15)',
        'glow-lg': '0 0 40px rgba(99, 102, 241, 0.2)',
      },
      fontSize: {
        'hero': ['56px', { lineHeight: '64px', fontWeight: '700' }],
        'page-title': ['32px', { lineHeight: '40px', fontWeight: '700' }],
        'section-title': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'card-title': ['18px', { lineHeight: '28px', fontWeight: '600' }],
        'body': ['15px', { lineHeight: '24px', fontWeight: '400' }],
        'small': ['13px', { lineHeight: '20px', fontWeight: '500' }],
        'caption': ['11px', { lineHeight: '16px', fontWeight: '400' }],
        'metric-lg': ['36px', { lineHeight: '44px', fontWeight: '700' }],
        'metric-sm': ['24px', { lineHeight: '32px', fontWeight: '600' }],
      },
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
        '2xl': '48px',
        '3xl': '64px',
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 15s ease-in-out infinite',
        'shimmer': 'shimmer 2s ease-in-out infinite',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #6366F1, #4F46E5)',
        'gradient-sidebar': 'linear-gradient(180deg, #0F0F1A 0%, #0C0C14 100%)',
      },
    },
  },
  plugins: [],
};
