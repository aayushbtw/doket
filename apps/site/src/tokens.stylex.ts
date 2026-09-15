import * as stylex from "@stylexjs/stylex";

// Named by role, valued by Radix step. Vars, not consts, so a theme could swap them.
export const colors = stylex.defineVars({
  background: "var(--gray-1)",
  border: "var(--gray-a4)",
  borderStrong: "var(--gray-a6)",
  borderSubtle: "var(--gray-a2)",
  fill: "var(--gray-a3)",
  fillSubtle: "var(--gray-a2)",
  textFaint: "var(--gray-8)",
  textMuted: "var(--gray-10)",
  textPrimary: "var(--gray-12)",
  textSecondary: "var(--gray-11)",
  textSubtle: "var(--gray-9)",
});

export const shadows = stylex.defineVars({
  raised:
    "0 0 0 1px color-mix(in oklab, var(--gray-a6), var(--gray-6) 25%), 0 0 0 0.5px var(--black-a3), 0 1px 1px 0 var(--black-a6), 0 2px 1px -1px var(--black-a6), 0 1px 3px 0 var(--black-a5)",
});

export const fonts = stylex.defineConsts({
  mono: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", monospace',
  sans: '"Inter Variable", sans-serif',
});

export const fontSizes = stylex.defineConsts({
  base: "14px",
  lg: "16px",
  md: "15px",
  sm: "13px",
  xl: "20px",
  xs: "12px",
  xxl: "22px",
  xxs: "11px",
});

export const lineHeights = stylex.defineConsts({
  base: "24px",
  lg: "24px",
  md: "22.5px",
  sm: "19.5px",
  xl: "30px",
  xs: "18px",
  xxl: 1.2,
});

export const letterSpacings = stylex.defineConsts({
  base: "-0.0871px",
  lg: "-0.1754px",
  md: "-0.132px",
  sm: "-0.0411px",
  xl: "-0.3331px",
  xs: "0.0059px",
  xxl: "-0.403px",
});

// Weights are set on the variable font's axis, like the reference, so `font-weight` stays 400.
export const weights = stylex.defineConsts({
  bold: '"wght" 700',
  emphasis: '"wght" 550',
  medium: '"wght" 500',
  regular: '"wght" 400',
  semibold: '"wght" 600',
});

export const space = stylex.defineConsts({
  px10: "10px",
  px12: "12px",
  px16: "16px",
  px2: "2px",
  px20: "20px",
  px24: "24px",
  px3: "3px",
  px32: "32px",
  px4: "4px",
  px48: "48px",
  px6: "6px",
  px8: "8px",
  px80: "80px",
});

export const radii = stylex.defineConsts({
  lg: "12px",
  md: "10px",
  sm: "6px",
  xs: "3px",
});

export const borderWidths = stylex.defineConsts({
  thick: "3px",
  thin: "1px",
});

export const durations = stylex.defineConsts({
  fast: "0.15s",
  slow: "0.2s",
});

export const below = stylex.defineConsts({
  lg: "@media (width <= 1024px)",
  md: "@media (width <= 768px)",
  xl: "@media (width <= 1280px)",
});

export const zIndices = stylex.defineConsts({
  behind: -1,
  header: 30,
});

export const layout = stylex.defineConsts({
  bodyWidth: "768px",
  columnGap: "48px",
  // The header height plus a 40px gap: where sidebar, article and TOC start.
  contentTop: "104px",
  itemHeight: "28px",
  pagePadding: "32px",
  pageTop: "64px",
  sidebarWidth: "200px",
  tocWidth: "200px",
  width: "1168px",
});

export const tableRow = stylex.defineMarker();
