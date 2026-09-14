import type { Config } from "tailwindcss"
import defaultColors from "tailwindcss/colors"

/**
 * Design tokens mirror the LURE Meta Platform style guide (luredash
 * `style.md` + `frontend/tailwind.config.ts`) so both products read as
 * one system: brand orange on warm white, Noto Sans TC, 12px radii.
 *
 * The shadcn semantic names (primary / muted / accent …) stay on the
 * `hsl(var(--x))` indirection — their VALUES are remapped to the LURE
 * palette in globals.css, which is what recolors every existing page
 * without touching it. The literal names below (`orange`, `ink`,
 * `border-strong`) exist for new chrome that needs the exact token.
 *
 * The numeric scales (orange-500, emerald-600 …) are spread back in on
 * purpose: `components/council/speaker.ts` uses them to tell speakers
 * apart, which is identity, not branding, and must stay distinguishable.
 */
const config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: {
          DEFAULT: "hsl(var(--border))",
          strong: "#E0E0E0",
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // ── LURE palette ──────────────────────────────────────────
        orange: {
          ...defaultColors.orange,
          DEFAULT: "#FF6B2C",
          dark: "#E55A1C",
          bg: "#FFF5F0",
          soft: "#FFFCFA",
          border: "#FFE8D9",
          muted: "#B07A50",
        },
        ink: "#1A1A1A",
        gray: {
          ...defaultColors.gray,
          300: "#AAAAAA",
          500: "#666666",
        },
        green: {
          ...defaultColors.green,
          DEFAULT: "#2E7D32",
          bg: "#E8F5E9",
        },
        red: {
          ...defaultColors.red,
          DEFAULT: "#C62828",
          bg: "#FFEBEE",
        },
        yellow: {
          ...defaultColors.yellow,
          DEFAULT: "#E65100",
          bg: "#FFF3E0",
        },
      },
      fontFamily: {
        sans: [
          '"Noto Sans TC"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "sans-serif",
        ],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        pill: "50px",
      },
      boxShadow: {
        sm: "0 2px 8px rgba(0,0,0,0.06)",
        md: "0 4px 24px rgba(0,0,0,0.08)",
      },
      spacing: {
        // Single source of truth for the desktop sidebar width —
        // Sidebar owns `w-sidebar`, nothing else should hard-code it.
        sidebar: "224px",
        topbar: "60px",
      },
      fontSize: {
        xxs: ["10px", { lineHeight: "1.3" }],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.25s ease-out both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
