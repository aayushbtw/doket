import * as stylex from "@stylexjs/stylex";

import { fontSizes, letterSpacings, lineHeights } from "./tokens.stylex";

const typography = stylex.create({
  base: {
    fontSize: fontSizes.base,
    letterSpacing: letterSpacings.base,
    lineHeight: lineHeights.base,
  },
  lg: {
    fontSize: fontSizes.lg,
    letterSpacing: letterSpacings.lg,
    lineHeight: lineHeights.lg,
  },
  md: {
    fontSize: fontSizes.md,
    letterSpacing: letterSpacings.md,
    lineHeight: lineHeights.md,
  },
  sm: {
    fontSize: fontSizes.sm,
    letterSpacing: letterSpacings.sm,
    lineHeight: lineHeights.sm,
  },
  xl: {
    fontSize: fontSizes.xl,
    letterSpacing: letterSpacings.xl,
    lineHeight: lineHeights.xl,
  },
  xs: {
    fontSize: fontSizes.xs,
    letterSpacing: letterSpacings.xs,
    lineHeight: lineHeights.xs,
  },
});

export { typography };
