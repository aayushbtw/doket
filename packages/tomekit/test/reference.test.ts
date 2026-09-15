import { describe, expect, it } from "vite-plus/test";

import { LOCATE, parse } from "../src/parse";
import { checkReferences } from "../src/reference";
import type {
  ReferencedCollection,
  References,
  ReferencingDocument,
} from "../src/reference";
import type { ContentFields } from "../src/value";

/** A document from `content/<collection>/<slug>.md`, located through its frontmatter when `text` is given. */
function document(
  collection: string,
  slug: string,
  metadata: ContentFields,
  text?: string
): ReferencingDocument {
  const file = `content/${collection}/${slug}.md`;

  const locate =
    text === undefined
      ? undefined
      : parse({ file: `${slug}.md`, filePath: file, text }).entry?.[LOCATE];

  return {
    file: text === undefined ? undefined : file,
    locate,
    output: { body: "", file: undefined, metadata, slug },
    slug,
  };
}

function collection(
  name: string,
  documents: readonly ReferencingDocument[],
  {
    broken = [],
    skipped = [],
  }: {
    broken?: readonly string[];
    skipped?: readonly (readonly [string, string | undefined])[];
  } = {}
): ReferencedCollection {
  return {
    broken: new Set(broken),
    documents,
    name,
    skipped: new Map(skipped),
  };
}

const authors = collection("authors", [
  document("authors", "ada", {}),
  document("authors", "grace", {}),
]);

function check(
  collections: readonly ReferencedCollection[],
  references: References
) {
  const { errors, leftOut } = checkReferences(collections, references);

  return {
    leftOut: Object.fromEntries(
      [...leftOut].map(([name, slugs]) => [name, [...slugs]])
    ),
    messages: errors.map((error) => error.message),
  };
}

describe("checkReferences", () => {
  it("accepts slugs that exist, in arrays, nested objects and optional fields", () => {
    const posts = collection("posts", [
      document("posts", "hello", {
        author: "ada",
        sections: [{ author: "grace" }, { title: "No author" }],
        tags: ["ada", "grace"],
      }),
    ]);

    expect(
      check([authors, posts], {
        posts: {
          author: "authors",
          editor: "authors",
          "sections.author": "authors",
          tags: "authors",
        },
      })
    ).toStrictEqual({
      leftOut: { authors: [], posts: [] },
      messages: [],
    });
  });

  it("points at each slug no document has, and leaves its document out", () => {
    const posts = collection("posts", [
      document(
        "posts",
        "hello",
        { author: "adaa", tags: ["ada", "nope"] },
        "---\nauthor: adaa\ntags:\n  - ada\n  - nope\n---\n"
      ),
    ]);

    expect(
      check([authors, posts], {
        posts: { author: "authors", tags: "authors" },
      })
    ).toStrictEqual({
      leftOut: { authors: [], posts: ["hello"] },
      messages: [
        'content/posts/hello.md:2:1: author: no document in collection "authors" has the slug "adaa". Fix the slug, or add a document with it to "authors"',
        'content/posts/hello.md:5:5: tags.1: no document in collection "authors" has the slug "nope". Fix the slug, or add a document with it to "authors"',
      ],
    });
  });

  it("names an entry without a file by its slug", () => {
    const posts = collection("posts", [
      document("posts", "hello", { author: "adaa" }),
    ]);

    expect(
      check([authors, posts], { posts: { author: "authors" } }).messages
    ).toStrictEqual([
      'collections.get("posts").get("hello"): author: no document in collection "authors" has the slug "adaa". Fix the slug, or add a document with it to "authors"',
    ]);
  });

  it("says when the slug belongs to a skipped or broken document", () => {
    const people = collection("people", [], {
      broken: ["broken"],
      skipped: [
        ["draft", "draft"],
        ["hidden", undefined],
      ],
    });

    const posts = collection("posts", [
      document("posts", "hello", { authors: ["draft", "hidden", "broken"] }),
    ]);

    expect(
      check([people, posts], { posts: { authors: "people" } }).messages
    ).toStrictEqual([
      'collections.get("posts").get("hello"): authors.0: "draft" in collection "people" is skipped (draft). Point at a document that is not skipped',
      'collections.get("posts").get("hello"): authors.1: "hidden" in collection "people" is skipped. Point at a document that is not skipped',
      'collections.get("posts").get("hello"): authors.2: "broken" in collection "people" has errors, so it is left out. Fix those first',
    ]);
  });

  it("leaves out documents that point at a document left out for its references", () => {
    const people = collection("people", [
      document("people", "ada", { mentor: "nobody" }),
    ]);

    const posts = collection("posts", [
      document("posts", "hello", { author: "ada" }),
    ]);

    expect(
      check([posts, people], {
        people: { mentor: "people" },
        posts: { author: "people" },
      })
    ).toStrictEqual({
      leftOut: { people: ["ada"], posts: ["hello"] },
      messages: [
        'collections.get("people").get("ada"): mentor: no document in collection "people" has the slug "nobody". Fix the slug, or add a document with it to "people"',
        'collections.get("posts").get("hello"): author: "ada" in collection "people" has errors, so it is left out. Fix those first',
      ],
    });
  });

  it("accepts collections that point at each other, or at themselves", () => {
    const people = collection("people", [
      document("people", "ada", { favorite: "hello", mentor: "grace" }),
      document("people", "grace", { favorite: "hello", mentor: "ada" }),
    ]);

    const posts = collection("posts", [
      document("posts", "hello", { author: "ada" }),
    ]);

    expect(
      check([people, posts], {
        people: { favorite: "posts", mentor: "people" },
        posts: { author: "people" },
      }).messages
    ).toStrictEqual([]);
  });

  it("checks only strings, so a transform can replace a slug with what it points at", () => {
    const posts = collection("posts", [
      document("posts", "hello", {
        author: { name: "Ada" },
        editors: [1, null, { name: "Grace" }],
      }),
    ]);

    expect(
      check([authors, posts], {
        posts: { author: "authors", editors: "authors" },
      }).messages
    ).toStrictEqual([]);
  });
});
