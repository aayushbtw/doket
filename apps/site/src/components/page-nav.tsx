import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { docLink } from "#/lib/links";

import {
  borderWidths,
  colors,
  durations,
  radii,
  shadows,
  space,
  weights,
} from "../tokens.stylex";
import { typography } from "../typography";

interface PageLink {
  slug: string;
  title: string;
}

interface PageNavProps {
  next: PageLink | undefined;
  previous: PageLink | undefined;
}

const styles = stylex.create({
  card: {
    backgroundColor: {
      ":hover": colors.fillSubtle,
      default: "transparent",
    },
    borderRadius: radii.lg,
    boxShadow: shadows.raised,
    color: colors.textMuted,
    display: "flex",
    flexDirection: "column",
    gap: space.px4,
    gridColumn: {
      ":only-child": "1 / -1",
      default: "auto",
    },
    paddingBlock: space.px12,
    paddingInline: space.px16,
    transitionDuration: durations.slow,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease",
  },
  direction: {
    color: colors.textSubtle,
    fontVariationSettings: weights.medium,
  },
  nav: {
    borderBlockStartColor: colors.border,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: borderWidths.thin,
    display: "grid",
    gap: space.px24,
    gridTemplateColumns: "1fr 1fr",
    marginBlockStart: space.px48,
    paddingBlock: space.px32,
  },
  next: {
    textAlign: "end",
  },
  title: {
    color: colors.textPrimary,
    fontVariationSettings: weights.emphasis,
  },
});

function PageNav({ next, previous }: PageNavProps) {
  if (!previous && !next) {
    return null;
  }

  return (
    <nav {...stylex.props(typography.sm, styles.nav)}>
      {previous ? (
        <Link {...docLink(previous.slug)} {...stylex.props(styles.card)}>
          <span {...stylex.props(styles.direction)}>Previous</span>
          <span {...stylex.props(styles.title)}>{previous.title}</span>
        </Link>
      ) : null}
      {next ? (
        <Link
          {...docLink(next.slug)}
          {...stylex.props(styles.card, styles.next)}
        >
          <span {...stylex.props(styles.direction)}>Next</span>
          <span {...stylex.props(styles.title)}>{next.title}</span>
        </Link>
      ) : null}
    </nav>
  );
}

export { PageNav };
