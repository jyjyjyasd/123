import type { Config } from "tailwindcss";

// Notion-style design tokens (PRD §5.2 / §5.3 / §5.4)
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces
        "bg-primary": "var(--bg-primary)",
        "bg-secondary": "var(--bg-secondary)",
        "bg-tertiary": "var(--bg-tertiary)",
        "bg-hover": "var(--bg-hover)",
        "bg-active": "var(--bg-active)",
        // Text
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",
        "text-disabled": "var(--text-disabled)",
        // Borders
        "border-default": "var(--border-default)",
        "border-strong": "var(--border-strong)",
        // Accent (used sparingly)
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-bg": "var(--accent-bg)",
        // Status
        success: "var(--success)",
        warning: "var(--warning)",
        error: "var(--error)",
        "error-bg": "var(--error-bg)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
      },
      fontSize: {
        // PRD §5.3: 12 / 13 / 14 / 16 / 20 / 28 / 40
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "18px" }],
        base: ["14px", { lineHeight: "20px" }],
        md: ["16px", { lineHeight: "24px" }],
        lg: ["20px", { lineHeight: "28px" }],
        xl: ["28px", { lineHeight: "36px" }],
        "2xl": ["40px", { lineHeight: "48px" }],
      },
      fontWeight: {
        // 400 / 500 / 600 only — no 700+ (PRD §5.5)
        normal: "400",
        medium: "500",
        semibold: "600",
      },
      borderRadius: {
        // PRD §5.4: 3 / 6 / 8px max
        sm: "3px",
        md: "6px",
        lg: "8px",
      },
      boxShadow: {
        // Only for floating layers (PRD §5.4)
        popover:
          "0 1px 2px rgba(15, 15, 15, 0.06), 0 4px 8px rgba(15, 15, 15, 0.08)",
        modal:
          "0 8px 16px rgba(15, 15, 15, 0.10), 0 16px 32px rgba(15, 15, 15, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
