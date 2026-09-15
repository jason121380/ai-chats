import type { Config } from "tailwindcss"
import defaultColors from "tailwindcss/colors"

/**
 * Design tokens follow designer_web's STYLE.md: rose-brand on gray-50,
 * Tailwind's stock neutral scale for text and borders, a single small
 * radius everywhere, and no shadows at all.
 *
 * The shadcn semantic names (primary / muted / accent …) stay on the
 * `hsl(var(--x))` indirection — only their VALUES change, in globals.css,
 * which is what recolors every existing page without editing it. The
 * literal `rose.brand/light/dark` names mirror designer_web's own config
 * so a class copied from that repo means the same thing here.
 *
 * Deliberately NOT ported: `--cream-1/2/3`. Those are the public site's
 * per-section background options; this app has no such feature, and an
 * unused token invites someone to reach for it as a surface colour.
 *
 * The numeric colour scales are spread back in on purpose —
 * components/council/speaker.ts uses them to tell participants apart,
 * which is identity, not branding, and must stay distinguishable.
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
    extend: {
      colors: {
        border: "hsl(var(--border))",
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

        // ── designer_web fixed interface colours ──────────────────
        rose: {
          ...defaultColors.rose,
          brand: "#C4837A",
          light: "#EDD5D2",
          dark: "#A3635B",
        },
      },
      fontFamily: {
        sans: [
          '"Noto Sans TC"',
          '"PingFang TC"',
          '"Microsoft JhengHei"',
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      spacing: {
        // designer_web's admin shell: w-64 sidebar, h-14 header.
        sidebar: "16rem",
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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
