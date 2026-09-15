import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { colors, radii, shadows } from "../tokens.stylex";
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
      ":hover": colors.grayA2,
      default: "transparent",
    },
    borderRadius: radii.large,
    boxShadow: shadows.level2,
    color: colors.gray10,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    gridColumn: {
      ":only-child": "1 / -1",
      default: "auto",
    },
    paddingBlock: "12px",
    paddingInline: "16px",
    transitionDuration: "0.2s",
    transitionProperty: "background-color",
    transitionTimingFunction: "ease",
  },
  direction: {
    color: colors.gray9,
    fontVariationSettings: '"wght" 500',
  },
  nav: {
    borderBlockStartColor: colors.grayA4,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: "1px",
    display: "grid",
    gap: "24px",
    gridTemplateColumns: "1fr 1fr",
    marginBlockStart: "48px",
    paddingBlock: "32px",
  },
  next: {
    textAlign: "end",
  },
  title: {
    color: colors.gray12,
    fontVariationSettings: '"wght" 550',
  },
});

function PageNav({ next, previous }: PageNavProps) {
  if (!previous && !next) {
    return null;
  }

  return (
    <nav {...stylex.props(typography.sm, styles.nav)}>
      {previous ? (
        <Link
          params={{ slug: previous.slug }}
          to="/docs/$slug"
          {...stylex.props(styles.card)}
        >
          <span {...stylex.props(styles.direction)}>Previous</span>
          <span {...stylex.props(styles.title)}>{previous.title}</span>
        </Link>
      ) : null}
      {next ? (
        <Link
          params={{ slug: next.slug }}
          to="/docs/$slug"
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
