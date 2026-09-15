import { linkOptions } from "@tanstack/react-router";

/** The doc served at `/`, which has no `/$slug` URL of its own. */
const homeSlug = "overview";

function docLink(slug: string) {
  return slug === homeSlug
    ? linkOptions({ to: "/" })
    : linkOptions({ params: { slug }, to: "/$slug" });
}

export { docLink, homeSlug };
