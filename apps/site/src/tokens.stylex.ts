import * as stylex from "@stylexjs/stylex";

export const colors = stylex.defineVars({
  gray1: "var(--gray-1)",
  gray3: "var(--gray-3)",
  gray8: "var(--gray-8)",
  gray9: "var(--gray-9)",
  gray10: "var(--gray-10)",
  gray11: "var(--gray-11)",
  gray12: "var(--gray-12)",
  grayA2: "var(--gray-a2)",
  grayA3: "var(--gray-a3)",
  grayA4: "var(--gray-a4)",
  grayA6: "var(--gray-a6)",
});

export const fonts = stylex.defineVars({
  mono: '"SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", monospace',
  sans: '"Inter Variable", sans-serif',
});

export const text = stylex.defineVars({
  baseLeading: "24px",
  baseSize: "14px",
  baseTracking: "-0.0871px",
  lgLeading: "24px",
  lgSize: "16px",
  lgTracking: "-0.1754px",
  mdLeading: "22.5px",
  mdSize: "15px",
  mdTracking: "-0.132px",
  smLeading: "19.5px",
  smSize: "13px",
  smTracking: "-0.0411px",
  xlLeading: "30px",
  xlSize: "20px",
  xlTracking: "-0.3331px",
  xsLeading: "18px",
  xsSize: "12px",
  xsTracking: "0.0059px",
});

export const radii = stylex.defineVars({
  large: "12px",
  medium: "10px",
  small: "6px",
});

export const shadows = stylex.defineVars({
  level2:
    "0 0 0 1px color-mix(in oklab, var(--gray-a6), var(--gray-6) 25%), 0 0 0 0.5px var(--black-a3), 0 1px 1px 0 var(--black-a6), 0 2px 1px -1px var(--black-a6), 0 1px 3px 0 var(--black-a5)",
});

export const layout = stylex.defineVars({
  // The header height plus a 40px gap: where sidebar, article and TOC start.
  contentTop: "104px",
  pagePadding: "32px",
  pageTop: "64px",
  sidebarWidth: "200px",
  tocWidth: "200px",
  width: "1168px",
});

export const tableRow = stylex.defineMarker();
