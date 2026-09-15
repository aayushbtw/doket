import * as stylex from "@stylexjs/stylex";
import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Sidebar } from "#/components/sidebar";
import { getNav } from "#/lib/docs";

import { layout } from "../tokens.stylex";

export const Route = createFileRoute("/_docs")({
  loader: () => getNav(),
  component: DocsLayout,
});

const styles = stylex.create({
  layout: {
    display: "flex",
    marginInline: "auto",
    maxWidth: layout.width,
    minHeight: "100dvh",
    paddingInline: layout.pagePadding,
  },
});

function DocsLayout() {
  const nav = Route.useLoaderData();

  return (
    <div {...stylex.props(styles.layout)}>
      <Sidebar nav={nav} />
      <Outlet />
    </div>
  );
}
