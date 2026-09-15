import * as stylex from "@stylexjs/stylex";
import { Markdown } from "@tanstack/markdown/react";
import type {
  MarkdownComponents,
  MarkdownProps,
} from "@tanstack/markdown/react";
import { createContext, use } from "react";
import type { ComponentPropsWithoutRef } from "react";

import { highlightCode } from "#/lib/highlight";

import { colors, fonts, radii, shadows, tableRow } from "../tokens.stylex";
import { typography } from "../typography";

interface ProseProps {
  body: MarkdownProps["children"];
}

const styles = stylex.create({
  a: {
    color: colors.gray12,
    textDecorationColor: {
      ":hover": colors.gray12,
      default: colors.grayA6,
    },
    textDecorationLine: "underline",
    textUnderlineOffset: "2px",
    transitionDuration: "0.15s",
    transitionProperty: "text-decoration-color",
  },
  blockquote: {
    borderInlineStartColor: colors.grayA6,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: "3px",
    color: colors.gray10,
    marginBlockEnd: {
      ":last-child": 0,
      default: "16px",
    },
    paddingInlineStart: "16px",
  },
  code: {
    borderRadius: "3px",
    boxShadow: shadows.level2,
    color: colors.gray12,
    fontFamily: fonts.mono,
    fontSize: "11px",
    paddingBlock: "2px",
    paddingInline: "3px",
    position: "relative",
    verticalAlign: "1.5px",
  },
  codeInPre: {
    display: "inline-block",
    fontFamily: fonts.mono,
    minWidth: "100%",
  },
  h2: {
    color: colors.gray12,
    fontVariationSettings: '"wght" 550',
    marginBlockEnd: "8px",
    marginBlockStart: {
      ":first-child": 0,
      default: "24px",
    },
  },
  h3: {
    color: colors.gray12,
    fontVariationSettings: '"wght" 700',
    marginBlockEnd: "8px",
    marginBlockStart: {
      ":first-child": 0,
      default: "16px",
    },
  },
  h4: {
    color: colors.gray12,
    fontVariationSettings: '"wght" 600',
    marginBlockEnd: "8px",
    marginBlockStart: {
      ":first-child": 0,
      default: "8px",
    },
  },
  hr: {
    borderBlockStartColor: colors.grayA4,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: "1px",
    marginBlock: "32px",
  },
  img: {
    borderRadius: radii.medium,
    marginBlockEnd: {
      ":last-child": 0,
      default: "16px",
    },
  },
  li: {
    "::marker": {
      color: colors.gray8,
    },
    listStyle: "inherit",
    marginBlockEnd: "4px",
  },
  ol: {
    listStyle: "decimal",
    marginBlockEnd: {
      ":last-child": 0,
      default: "16px",
    },
    paddingInlineStart: "20px",
  },
  p: {
    lineHeight: "24px",
    marginBlockEnd: {
      ":last-child": 0,
      default: "16px",
    },
  },
  pre: {
    borderColor: colors.grayA4,
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: "1px",
    color: colors.gray12,
    marginBlockEnd: {
      ":last-child": 0,
      default: "24px",
    },
    overflowX: "auto",
    paddingBlock: "12px",
    paddingInline: "16px",
    scrollbarWidth: "none",
    whiteSpace: "pre",
  },
  prose: {
    color: colors.gray11,
    minWidth: 0,
  },
  strong: {
    color: colors.gray12,
    fontWeight: 600,
  },
  table: {
    borderCollapse: "separate",
    borderSpacing: 0,
    minWidth: "100%",
  },
  tableScroll: {
    borderRadius: radii.medium,
    marginBlockEnd: {
      ":last-child": 0,
      default: "16px",
    },
    overflowX: "auto",
    scrollbarWidth: "none",
  },
  td: {
    borderBlockEndColor: colors.grayA2,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: {
      [stylex.when.ancestor(":last-child", tableRow)]: 0,
      default: "1px",
    },
    paddingBlock: "12px",
    paddingInline: "16px",
    textAlign: "start",
    whiteSpace: "nowrap",
  },
  th: {
    backgroundColor: colors.grayA2,
    borderEndEndRadius: {
      ":last-child": radii.medium,
      default: 0,
    },
    borderEndStartRadius: {
      ":first-child": radii.medium,
      default: 0,
    },
    borderStartEndRadius: {
      ":last-child": radii.medium,
      default: 0,
    },
    borderStartStartRadius: {
      ":first-child": radii.medium,
      default: 0,
    },
    color: colors.gray10,
    fontVariationSettings: '"wght" 550',
    paddingBlock: "12px",
    paddingInline: "16px",
    textAlign: "start",
    whiteSpace: "nowrap",
  },
  ul: {
    listStyle: "disc",
    marginBlockEnd: {
      ":last-child": 0,
      default: "16px",
    },
    paddingInlineStart: "20px",
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
