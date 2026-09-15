import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import {
  colors,
  durations,
  layout,
  radii,
  space,
  weights,
  zIndices,
} from "../tokens.stylex";
import { typography } from "../typography";

const styles = stylex.create({
  github: {
    alignItems: "center",
    backgroundColor: {
      ":hover": colors.fill,
      default: "transparent",
    },
    borderRadius: radii.sm,
    color: {
      ":hover": colors.textPrimary,
      default: colors.textMuted,
    },
    display: "flex",
    height: layout.itemHeight,
    paddingInline: space.px10,
    transitionDuration: durations.fast,
    transitionProperty: "color, background-color",
  },
  header: {
    backgroundColor: colors.background,
    height: layout.pageTop,
    insetInline: 0,
    position: "fixed",
    top: 0,
    zIndex: zIndices.header,
  },
  inner: {
    alignItems: "center",
    display: "flex",
    height: "100%",
    justifyContent: "space-between",
    marginInline: "auto",
    maxWidth: layout.width,
    paddingInline: layout.pagePadding,
  },
  logo: {
    color: colors.textPrimary,
    fontVariationSettings: weights.semibold,
  },
});

function Header() {
  return (
    <header {...stylex.props(styles.header)}>
      <div {...stylex.props(styles.inner)}>
        <Link to="/" {...stylex.props(typography.base, styles.logo)}>
          tomekit
        </Link>
        <a
          href="https://github.com/aayushbtw/tomekit"
          {...stylex.props(typography.sm, styles.github)}
        >
          GitHub
        </a>
      </div>
    </header>
  );
}

export { Header };
