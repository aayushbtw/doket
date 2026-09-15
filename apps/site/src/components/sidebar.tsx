import * as stylex from "@stylexjs/stylex";
import { Link, useParams } from "@tanstack/react-router";

import { colors, layout } from "../tokens.stylex";
import { typography } from "../typography";

interface SidebarProps {
  nav: {
    pages: { slug: string; title: string }[];
    section: string;
  }[];
}

const styles = stylex.create({
  active: {
    color: colors.gray12,
    fontVariationSettings: '"wght" 500',
  },
  label: {
    alignItems: "center",
    color: colors.gray12,
    display: "flex",
    fontVariationSettings: '"wght" 500',
    height: "28px",
  },
  link: {
    alignItems: "center",
    color: {
      ":hover": colors.gray12,
      default: colors.gray10,
    },
    display: "flex",
    fontVariationSettings: {
      ":hover": '"wght" 500',
      default: '"wght" 400',
    },
    height: "28px",
    transitionDuration: "0.15s",
    transitionProperty: "color, font-variation-settings",
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  section: {
    display: "flex",
    flexDirection: "column",
  },
  sidebar: {
    display: {
      "@media (width <= 1024px)": "none",
      default: "flex",
    },
    flexDirection: "column",
    flexShrink: 0,
    height: "100dvh",
    marginInlineEnd: "48px",
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
