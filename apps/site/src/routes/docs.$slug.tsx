import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";

import { PageNav } from "#/components/page-nav";
import { Prose } from "#/components/prose";
import { Toc } from "#/components/toc";
import { getDoc } from "#/lib/docs";

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

// Not sorted: `loader` must come before `head` and `component`, which infer `loaderData` from it.
export const Route = createFileRoute("/docs/$slug")({
  loader: ({ params }) => getDoc({ data: params.slug }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.metadata.title ?? "Docs"} · tomekit` }],
  }),
  component: Doc,
});

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

function Doc() {
  const { body, metadata, next, previous } = Route.useLoaderData();

  return (
    <>
      <article {...stylex.props(styles.article)}>
        <h1 {...stylex.props(styles.title)}>{metadata.title}</h1>
        <p {...stylex.props(typography.base, styles.description)}>
          {metadata.description}
        </p>
        <Prose body={body} />
        <PageNav next={next} previous={previous} />
      </article>
      <Toc headings={metadata.headings} />
    </>
  );
}
