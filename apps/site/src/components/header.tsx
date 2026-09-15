import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { colors, layout, radii } from "../tokens.stylex";
import { typography } from "../typography";

const styles = stylex.create({
  github: {
    alignItems: "center",
    backgroundColor: {
      ":hover": colors.grayA3,
      default: "transparent",
    },
    borderRadius: radii.small,
    color: {
      ":hover": colors.gray12,
      default: colors.gray10,
    },
    display: "flex",
    height: "28px",
    paddingInline: "10px",
    transitionDuration: "0.15s",
    transitionProperty: "color, background-color",
  },
  header: {
    backgroundColor: colors.gray1,
    height: layout.pageTop,
    insetInline: 0,
    position: "fixed",
    top: 0,
    zIndex: 30,
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
    color: colors.gray12,
    fontVariationSettings: '"wght" 600',
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
