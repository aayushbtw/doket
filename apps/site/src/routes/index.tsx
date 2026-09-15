import * as stylex from "@stylexjs/stylex";
import { createFileRoute, Link } from "@tanstack/react-router";

import { colors, layout, space, weights } from "../tokens.stylex";
import { typography } from "../typography";

export const Route = createFileRoute("/")({ component: Home });

const styles = stylex.create({
  description: {
    color: colors.textSecondary,
    marginBlockEnd: space.px24,
  },
  link: {
    color: colors.textPrimary,
    textDecorationColor: {
      ":hover": colors.textPrimary,
      default: colors.borderStrong,
    },
    textDecorationLine: "underline",
    textUnderlineOffset: space.px2,
  },
  main: {
    marginInline: "auto",
    maxWidth: layout.bodyWidth,
    paddingBlockStart: layout.contentTop,
    paddingInline: layout.pagePadding,
  },
  title: {
    color: colors.textPrimary,
    fontVariationSettings: weights.semibold,
    marginBlockEnd: space.px8,
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
