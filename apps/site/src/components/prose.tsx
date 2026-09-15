import * as stylex from "@stylexjs/stylex";
import { Markdown } from "@tanstack/markdown/react";
import type {
  MarkdownComponents,
  MarkdownProps,
} from "@tanstack/markdown/react";
import { createContext, use } from "react";
import type { ComponentPropsWithoutRef } from "react";

import { highlightCode } from "#/lib/highlight";

import {
  borderWidths,
  colors,
  durations,
  fonts,
  fontSizes,
  lineHeights,
  radii,
  shadows,
  space,
  tableRow,
  weights,
} from "../tokens.stylex";
import { typography } from "../typography";

interface ProseProps {
  body: MarkdownProps["children"];
}

const styles = stylex.create({
  a: {
    color: colors.textPrimary,
    textDecorationColor: {
      ":hover": colors.textPrimary,
      default: colors.borderStrong,
    },
    textDecorationLine: "underline",
    textUnderlineOffset: space.px2,
    transitionDuration: durations.fast,
    transitionProperty: "text-decoration-color",
  },
  blockquote: {
    borderInlineStartColor: colors.borderStrong,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: borderWidths.thick,
    color: colors.textMuted,
    marginBlockEnd: {
      ":last-child": 0,
      default: space.px16,
    },
    paddingInlineStart: space.px16,
  },
  code: {
    borderRadius: radii.xs,
    boxShadow: shadows.raised,
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xxs,
    paddingBlock: space.px2,
    paddingInline: space.px3,
    position: "relative",
    // Optical: lifts the smaller mono text onto the prose baseline.
    verticalAlign: "1.5px",
  },
  codeInPre: {
    display: "inline-block",
    fontFamily: fonts.mono,
    minWidth: "100%",
  },
  h2: {
    color: colors.textPrimary,
    fontVariationSettings: weights.emphasis,
    marginBlockEnd: space.px8,
    marginBlockStart: {
      ":first-child": 0,
      default: space.px24,
    },
  },
  h3: {
    color: colors.textPrimary,
    fontVariationSettings: weights.bold,
    marginBlockEnd: space.px8,
    marginBlockStart: {
      ":first-child": 0,
      default: space.px16,
    },
  },
  h4: {
    color: colors.textPrimary,
    fontVariationSettings: weights.semibold,
    marginBlockEnd: space.px8,
    marginBlockStart: {
      ":first-child": 0,
      default: space.px8,
    },
  },
  hr: {
    borderBlockStartColor: colors.border,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: borderWidths.thin,
    marginBlock: space.px32,
  },
  img: {
    borderRadius: radii.md,
    marginBlockEnd: {
      ":last-child": 0,
      default: space.px16,
    },
  },
  li: {
    "::marker": {
      color: colors.textFaint,
    },
    listStyle: "inherit",
    marginBlockEnd: space.px4,
  },
  ol: {
    listStyle: "decimal",
    marginBlockEnd: {
      ":last-child": 0,
      default: space.px16,
    },
    paddingInlineStart: space.px20,
  },
  p: {
    lineHeight: lineHeights.base,
    marginBlockEnd: {
      ":last-child": 0,
      default: space.px16,
    },
  },
  pre: {
    borderColor: colors.border,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: borderWidths.thin,
    color: colors.textPrimary,
    marginBlockEnd: {
      ":last-child": 0,
      default: space.px24,
    },
    overflowX: "auto",
    paddingBlock: space.px12,
    paddingInline: space.px16,
    scrollbarWidth: "none",
    whiteSpace: "pre",
  },
  prose: {
    color: colors.textSecondary,
    minWidth: 0,
  },
  strong: {
    color: colors.textPrimary,
    fontWeight: 600,
  },
  table: {
    borderCollapse: "separate",
    borderSpacing: 0,
    minWidth: "100%",
  },
  tableScroll: {
    borderRadius: radii.md,
    marginBlockEnd: {
      ":last-child": 0,
      default: space.px16,
    },
    overflowX: "auto",
    scrollbarWidth: "none",
  },
  td: {
    borderBlockEndColor: colors.borderSubtle,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: {
      [stylex.when.ancestor(":last-child", tableRow)]: 0,
      default: borderWidths.thin,
    },
    paddingBlock: space.px12,
    paddingInline: space.px16,
    textAlign: "start",
    whiteSpace: "nowrap",
  },
  th: {
    backgroundColor: colors.fillSubtle,
    borderEndEndRadius: {
      ":last-child": radii.md,
      default: 0,
    },
    borderEndStartRadius: {
      ":first-child": radii.md,
      default: 0,
    },
    borderStartEndRadius: {
      ":last-child": radii.md,
      default: 0,
    },
    borderStartStartRadius: {
      ":first-child": radii.md,
      default: 0,
    },
    color: colors.textMuted,
    fontVariationSettings: weights.emphasis,
    paddingBlock: space.px12,
    paddingInline: space.px16,
    textAlign: "start",
    whiteSpace: "nowrap",
  },
  ul: {
    listStyle: "disc",
    marginBlockEnd: {
      ":last-child": 0,
      default: space.px16,
    },
    paddingInlineStart: space.px20,
  },
});

// Inline `code` and the `code` inside a `pre` are the same element; only the inline one gets a box.
const InPre = createContext(false);

function Pre(props: ComponentPropsWithoutRef<"pre">) {
  return (
    <InPre value>
      <pre {...props} {...stylex.props(typography.sm, styles.pre)} />
    </InPre>
  );
}

function Code(props: ComponentPropsWithoutRef<"code">) {
  const inPre = use(InPre);

  return (
    <code
      {...props}
      {...stylex.props(inPre ? styles.codeInPre : styles.code)}
    />
  );
}

function Table(props: ComponentPropsWithoutRef<"table">) {
  return (
    <div {...stylex.props(styles.tableScroll)}>
      <table {...props} {...stylex.props(typography.base, styles.table)} />
    </div>
  );
}

const components: MarkdownComponents = {
  a: (props) => <a {...props} {...stylex.props(styles.a)} />,
  blockquote: (props) => (
    <blockquote {...props} {...stylex.props(styles.blockquote)} />
  ),
  code: Code,
  h2: (props) => <h2 {...props} {...stylex.props(typography.lg, styles.h2)} />,
  h3: (props) => <h3 {...props} {...stylex.props(typography.md, styles.h3)} />,
  h4: (props) => (
    <h4 {...props} {...stylex.props(typography.base, styles.h4)} />
  ),
  hr: (props) => <hr {...props} {...stylex.props(styles.hr)} />,
  img: (props) => <img {...props} {...stylex.props(styles.img)} />,
  li: (props) => <li {...props} {...stylex.props(styles.li)} />,
  ol: (props) => <ol {...props} {...stylex.props(styles.ol)} />,
  p: (props) => <p {...props} {...stylex.props(styles.p)} />,
  pre: Pre,
  strong: (props) => <strong {...props} {...stylex.props(styles.strong)} />,
  table: Table,
  td: (props) => <td {...props} {...stylex.props(styles.td)} />,
  th: (props) => <th {...props} {...stylex.props(typography.sm, styles.th)} />,
  tr: (props) => <tr {...props} {...stylex.props(tableRow)} />,
  ul: (props) => <ul {...props} {...stylex.props(styles.ul)} />,
};

function Prose({ body }: ProseProps) {
  return (
    <div {...stylex.props(typography.base, styles.prose)}>
      <Markdown
        codeLineNumbers
        components={components}
        highlighter={highlightCode}
      >
        {body}
      </Markdown>
    </div>
  );
}

export { Prose };
