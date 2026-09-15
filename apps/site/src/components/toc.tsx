import * as stylex from "@stylexjs/stylex";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  below,
  colors,
  durations,
  layout,
  radii,
  space,
  weights,
  zIndices,
} from "../tokens.stylex";
import { typography } from "../typography";

interface Heading {
  id: string;
  text: string;
}

interface TocProps {
  headings: Heading[];
}

interface Highlight {
  height: number;
  top: number;
}

// Where content starts under the fixed header, matching `layout.contentTop`.
const passedLine = 104;

const styles = stylex.create({
  active: {
    color: colors.textPrimary,
    fontVariationSettings: weights.emphasis,
  },
  highlight: {
    backgroundColor: colors.fillSubtle,
    borderRadius: radii.sm,
    insetInline: 0,
    opacity: 0,
    pointerEvents: "none",
    position: "absolute",
    transitionDuration: durations.fast,
    transitionProperty: "top, height, opacity",
    transitionTimingFunction: "ease",
    zIndex: zIndices.behind,
  },
  highlightAt: (top: string, height: string) => ({
    height,
    opacity: 1,
    top,
  }),
  label: {
    color: colors.textSecondary,
    fontVariationSettings: weights.medium,
    marginBlockEnd: space.px12,
    paddingInlineStart: space.px12,
  },
  link: {
    borderRadius: radii.sm,
    color: {
      ":hover": colors.textPrimary,
      default: colors.textSubtle,
    },
    display: "block",
    paddingBlock: space.px6,
    paddingInlineStart: space.px12,
    transitionDuration: durations.fast,
    transitionProperty: "color",
  },
  list: {
    display: "flex",
    flexDirection: "column",
  },
  nav: {
    isolation: "isolate",
    position: "relative",
  },
  toc: {
    display: {
      [below.xl]: "none",
      default: "block",
    },
    flexShrink: 0,
    height: "100dvh",
    marginInlineStart: layout.columnGap,
    overflowY: "auto",
    paddingBlockStart: layout.contentTop,
    position: "sticky",
    top: 0,
    width: layout.tocWidth,
  },
});

function activeHeadingId(headings: Heading[]) {
  const elements = headings.flatMap(({ id }) => {
    const element = document.getElementById(id);

    return element ? [element] : [];
  });

  const { scrollHeight } = document.documentElement;
  const scrollable = scrollHeight > window.innerHeight;
  // 1px of slack: scroll positions can be fractional.
  const atBottom = window.scrollY + window.innerHeight >= scrollHeight - 1;

  // A short last section can never reach the line, so the bottom of the page selects it.
  if (scrollable && atBottom) {
    return elements.at(-1)?.id;
  }

  const passed = elements.filter(
    (element) => element.getBoundingClientRect().top <= passedLine
  );

  return (passed.at(-1) ?? elements.at(0))?.id;
}

function useActiveHeadingId(headings: Heading[]) {
  const [activeId, setActiveId] = useState<string>();

  useEffect(() => {
    function update() {
      setActiveId(activeHeadingId(headings));
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [headings]);

  return activeId;
}

function Toc({ headings }: TocProps) {
  const activeId = useActiveHeadingId(headings);
  const items = useRef(new Map<string, HTMLLIElement>());
  const [highlight, setHighlight] = useState<Highlight>();

  useLayoutEffect(() => {
    const item =
      activeId === undefined ? undefined : items.current.get(activeId);

    setHighlight(
      item ? { height: item.offsetHeight, top: item.offsetTop } : undefined
    );
  }, [activeId]);

  return (
    <aside {...stylex.props(typography.xs, styles.toc)}>
      {headings.length > 0 ? (
        <>
          <p {...stylex.props(styles.label)}>Table of Contents</p>
          <div {...stylex.props(styles.nav)}>
            <div
              aria-hidden
              {...stylex.props(
                styles.highlight,
                highlight !== undefined &&
                  styles.highlightAt(
                    `${highlight.top}px`,
                    `${highlight.height}px`
                  )
              )}
            />
            <ul {...stylex.props(styles.list)}>
              {headings.map(({ id, text }) => (
                <li
                  key={id}
                  ref={(item) => {
                    if (item) {
                      items.current.set(id, item);
                    }

                    return () => {
                      items.current.delete(id);
                    };
                  }}
                >
                  <a
                    href={`#${id}`}
                    {...stylex.props(
                      styles.link,
                      id === activeId && styles.active
                    )}
                  >
                    {text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </aside>
  );
}

export { Toc };
