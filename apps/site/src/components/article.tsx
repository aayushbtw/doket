import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";

import {
  below,
  colors,
  fontSizes,
  layout,
  letterSpacings,
  lineHeights,
  space,
  weights,
} from "../tokens.stylex";
import { typography } from "../typography";
import { Prose } from "./prose";
import { Toc } from "./toc";

interface ArticleProps {
  body: ComponentProps<typeof Prose>["body"];
  /** Rendered after the body, eg page navigation. */
  children?: ReactNode;
  description: string | undefined;
  headings: ComponentProps<typeof Toc>["headings"];
  title: string;
}

const styles = stylex.create({
  article: {
    flex: 1,
    minWidth: 0,
    paddingBlockEnd: space.px80,
    paddingBlockStart: layout.contentTop,
  },
  description: {
    color: colors.textSecondary,
    marginBlockEnd: space.px16,
  },
  title: {
    color: colors.textPrimary,
    fontSize: {
      [below.md]: fontSizes.xxl,
      default: fontSizes.xl,
    },
    fontVariationSettings: {
      [below.md]: weights.bold,
      default: weights.semibold,
    },
    letterSpacing: {
      [below.md]: letterSpacings.xxl,
      default: letterSpacings.xl,
    },
    lineHeight: {
      [below.md]: lineHeights.xxl,
      default: lineHeights.xl,
    },
    marginBlockEnd: space.px8,
  },
});

function Article({
  body,
  children,
  description,
  headings,
  title,
}: ArticleProps) {
  return (
    <>
      <article {...stylex.props(styles.article)}>
        <h1 {...stylex.props(styles.title)}>{title}</h1>
        {description === undefined ? null : (
          <p {...stylex.props(typography.base, styles.description)}>
            {description}
          </p>
        )}
        <Prose body={body} />
        {children}
      </article>
      <Toc headings={headings} />
    </>
  );
}

export { Article };
