import * as stylex from "@stylexjs/stylex";

import { text } from "./tokens.stylex";

const typography = stylex.create({
  base: {
    fontSize: text.baseSize,
    letterSpacing: text.baseTracking,
    lineHeight: text.baseLeading,
  },
  lg: {
    fontSize: text.lgSize,
    letterSpacing: text.lgTracking,
    lineHeight: text.lgLeading,
  },
  md: {
    fontSize: text.mdSize,
    letterSpacing: text.mdTracking,
    lineHeight: text.mdLeading,
  },
  sm: {
    fontSize: text.smSize,
    letterSpacing: text.smTracking,
    lineHeight: text.smLeading,
  },
  xl: {
    fontSize: text.xlSize,
    letterSpacing: text.xlTracking,
    lineHeight: text.xlLeading,
  },
  xs: {
    fontSize: text.xsSize,
    letterSpacing: text.xsTracking,
    lineHeight: text.xsLeading,
  },
});

export { typography };
