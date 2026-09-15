import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";

import { PageNav } from "#/components/page-nav";
import { Prose } from "#/components/prose";
import { Toc } from "#/components/toc";
import { getDoc } from "#/lib/docs";

import { colors, layout, text } from "../tokens.stylex";
import { typography } from "../typography";

// Not sorted: `loader` must come before `head` and `component`, which infer `loaderData` from it.
export const Route = createFileRoute("/docs/$slug")({
  loader: ({ params }) => getDoc({ data: params.slug }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.metadata.title ?? "Docs"} · tomekit` }],
  }),
  component: Doc,
});

const narrow = "@media (width <= 768px)";

const styles = stylex.create({
  article: {
    flex: 1,
    minWidth: 0,
    paddingBlockEnd: "80px",
    paddingBlockStart: layout.contentTop,
  },
  description: {
    color: colors.gray11,
    marginBlockEnd: "16px",
  },
  title: {
    color: colors.gray12,
    fontSize: {
      [narrow]: "22px",
      default: text.xlSize,
    },
    fontVariationSettings: {
      [narrow]: '"wght" 700',
      default: '"wght" 600',
    },
    letterSpacing: {
      [narrow]: "-0.403px",
      default: text.xlTracking,
    },
    lineHeight: {
      [narrow]: 1.2,
      default: text.xlLeading,
    },
    marginBlockEnd: "8px",
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
