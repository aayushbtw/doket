import * as stylex from "@stylexjs/stylex";
import { Link, useParams } from "@tanstack/react-router";

import {
  below,
  colors,
  durations,
  layout,
  space,
  weights,
} from "../tokens.stylex";
import { typography } from "../typography";

interface SidebarProps {
  nav: {
    pages: { slug: string; title: string }[];
    section: string;
  }[];
}

const styles = stylex.create({
  active: {
    color: colors.textPrimary,
    fontVariationSettings: weights.medium,
  },
  label: {
    alignItems: "center",
    color: colors.textPrimary,
    display: "flex",
    fontVariationSettings: weights.medium,
    height: layout.itemHeight,
  },
  link: {
    alignItems: "center",
    color: {
      ":hover": colors.textPrimary,
      default: colors.textMuted,
    },
    display: "flex",
    fontVariationSettings: {
      ":hover": weights.medium,
      default: weights.regular,
    },
    height: layout.itemHeight,
    transitionDuration: durations.fast,
    transitionProperty: "color, font-variation-settings",
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: space.px24,
  },
  section: {
    display: "flex",
    flexDirection: "column",
  },
  sidebar: {
    display: {
      [below.lg]: "none",
      default: "flex",
    },
    flexDirection: "column",
    flexShrink: 0,
    height: "100dvh",
    marginInlineEnd: layout.columnGap,
    overflowY: "auto",
    paddingBlockStart: layout.contentTop,
    position: "sticky",
    scrollbarWidth: "none",
    top: 0,
    width: layout.sidebarWidth,
  },
});

function Sidebar({ nav }: SidebarProps) {
  const { slug: current } = useParams({ strict: false });

  return (
    <aside {...stylex.props(typography.xs, styles.sidebar)}>
      <nav {...stylex.props(styles.nav)}>
        {nav.map(({ pages, section }) => (
          <div key={section} {...stylex.props(styles.section)}>
            <p {...stylex.props(styles.label)}>{section}</p>
            {pages.map(({ slug, title }) => (
              <Link
                key={slug}
                params={{ slug }}
                to="/docs/$slug"
                {...stylex.props(
                  styles.link,
                  slug === current && styles.active
                )}
              >
                {title}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}

export { Sidebar };
