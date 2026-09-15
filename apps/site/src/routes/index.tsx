import * as stylex from "@stylexjs/stylex";
import { createFileRoute, Link } from "@tanstack/react-router";

import { colors, layout } from "../tokens.stylex";
import { typography } from "../typography";

export const Route = createFileRoute("/")({ component: Home });

const styles = stylex.create({
  description: {
    color: colors.gray11,
    marginBlockEnd: "24px",
  },
  link: {
    color: colors.gray12,
    textDecorationColor: {
      ":hover": colors.gray12,
      default: colors.grayA6,
    },
    textDecorationLine: "underline",
    textUnderlineOffset: "2px",
  },
  main: {
    marginInline: "auto",
    maxWidth: "768px",
    paddingBlockStart: layout.contentTop,
    paddingInline: layout.pagePadding,
  },
  title: {
    color: colors.gray12,
    fontVariationSettings: '"wght" 600',
    marginBlockEnd: "8px",
  },
});

function Home() {
  return (
    <main {...stylex.props(typography.base, styles.main)}>
      <h1 {...stylex.props(typography.xl, styles.title)}>tomekit</h1>
      <p {...stylex.props(styles.description)}>
        Fully typed content collections for Markdown.
      </p>
      <Link
        params={{ slug: "overview" }}
        to="/docs/$slug"
        {...stylex.props(styles.link)}
      >
        Read the docs
      </Link>
    </main>
  );
}
