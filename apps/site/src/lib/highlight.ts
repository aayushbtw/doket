import { createHighlighter } from "@tanstack/highlight/core";
import { json } from "@tanstack/highlight/languages/json";
import { shell } from "@tanstack/highlight/languages/shell";
import { ts } from "@tanstack/highlight/languages/ts";
import { tsx } from "@tanstack/highlight/languages/tsx";
import { createTanStackMarkdownHighlighter } from "@tanstack/highlight/markdown";

// Server and client must share one registry, or hydrated code blocks tokenize differently from the SSR markup.
const highlighter = createHighlighter({ languages: [json, shell, ts, tsx] });

const highlightCode = createTanStackMarkdownHighlighter(highlighter);

export { highlightCode };
