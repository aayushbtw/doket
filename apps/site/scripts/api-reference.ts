/// <reference types="node" />
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DocCodeSpan,
  DocErrorText,
  DocEscapedText,
  DocFencedCode,
  DocLinkTag,
  DocParagraph,
  DocPlainText,
  DocSoftBreak,
  TSDocConfiguration,
  TSDocParser,
  TSDocTagDefinition,
  TSDocTagSyntaxKind,
} from "@microsoft/tsdoc";
import type { DocNode } from "@microsoft/tsdoc";
import { parseSync } from "oxc-parser";
import type {
  ClassElement,
  Function as FunctionNode,
  TSSignature,
} from "oxc-parser";

type ParseResult = ReturnType<typeof parseSync>;

type Statement = ParseResult["program"]["body"][number];

type SourceComment = ParseResult["comments"][number];

type ExportSpecifier = Extract<
  Statement,
  { type: "ExportNamedDeclaration" }
>["specifiers"][number];

type ModuleExportName = ExportSpecifier["exported"];

type Member = ClassElement | TSSignature;

type Kind = "Class" | "Function" | "Interface" | "Type Alias" | "Variable";

interface Span {
  end: number;
  start: number;
}

interface Entry {
  description: string;
  file: string;
  order: number;
  slug: string;
  title: string;
}

interface Import {
  name: string;
  source: string;
}

interface Module {
  code: string;
  comments: readonly SourceComment[];
  declarations: Map<string, Statement[]>;
  /** Exported name to local name. */
  exported: Map<string, string>;
  file: string;
  imports: Map<string, Import>;
}

interface Resolved {
  nodes: Statement[];
  parsed: Module;
}

interface Doc {
  defaultValue: string | undefined;
  examples: string[];
  internal: boolean;
  params: Map<string, string>;
  returns: string | undefined;
  summary: string;
}

interface KindInfo {
  directory: string;
  heading: string;
  kind: Kind;
}

interface Item {
  doc: Doc | undefined;
  entry: Entry;
  kind: KindInfo;
  name: string;
  resolved: Resolved;
}

interface MemberGroup {
  category: string;
  heading: string;
  name: string;
  nodes: Member[];
}

/** Where a declaration lives in `packages/tomekit/src`, for "Defined in" links. */
interface SourceDeclaration {
  file: string;
  node: Statement;
  source: Module;
}

const entries: readonly Entry[] = [
  {
    description: "Config helpers, types and error classes.",
    file: "index.d.mts",
    order: 1,
    slug: "api-tomekit",
    title: "tomekit",
  },
  {
    description: "The typed reading API.",
    file: "content.d.mts",
    order: 2,
    slug: "api-content",
    title: "tomekit/content",
  },
  {
    description: "The Vite plugin and its options.",
    file: "vite.d.mts",
    order: 3,
    slug: "api-vite",
    title: "tomekit/vite",
  },
];

// Index page order, matching the reference docs this layout follows.
const kinds: readonly KindInfo[] = [
  { directory: "classes", heading: "Classes", kind: "Class" },
  { directory: "interfaces", heading: "Interfaces", kind: "Interface" },
  { directory: "type-aliases", heading: "Type Aliases", kind: "Type Alias" },
  { directory: "variables", heading: "Variables", kind: "Variable" },
  { directory: "functions", heading: "Functions", kind: "Function" },
];

const nodeKinds = new Map<string, Kind>([
  ["ClassDeclaration", "Class"],
  ["FunctionDeclaration", "Function"],
  ["TSDeclareFunction", "Function"],
  ["TSInterfaceDeclaration", "Interface"],
  ["TSTypeAliasDeclaration", "Type Alias"],
  ["VariableDeclaration", "Variable"],
]);

const memberCategories = ["Constructors", "Properties", "Methods"] as const;

const repository =
  "https://github.com/aayushbtw/tomekit/blob/main/packages/tomekit";

const packageRoot = path.dirname(
  fileURLToPath(import.meta.resolve("tomekit/package.json"))
);

const dist = path.join(packageRoot, "dist");

const siteRoot = fileURLToPath(new URL("../", import.meta.url));

const docsOutput = path.join(siteRoot, "content/docs");

const referenceOutput = path.join(siteRoot, "content/reference");

const configuration = new TSDocConfiguration();

// `@default` is not a standard TSDoc tag, so it must be registered to parse as a block.
configuration.addTagDefinition(
  new TSDocTagDefinition({
    syntaxKind: TSDocTagSyntaxKind.BlockTag,
    tagName: "@default",
  })
);

const parser = new TSDocParser(configuration);

const modules = new Map<string, Module>();

/** Export name to its reference page URL, so types in signatures can link to their pages. */
const links = new Map<string, string>();

function exportName(node: ModuleExportName) {
  return node.type === "Identifier" ? node.name : node.value;
}

function declaredName(statement: Statement) {
  switch (statement.type) {
    case "ClassDeclaration":
    case "FunctionDeclaration":
    case "TSDeclareFunction":
    case "TSInterfaceDeclaration":
    case "TSTypeAliasDeclaration": {
      return statement.id?.name;
    }

    case "VariableDeclaration": {
      const [first] = statement.declarations;

      return first?.id.type === "Identifier" ? first.id.name : undefined;
    }

    default: {
      return undefined;
    }
  }
}

function collect(parsed: Module, statement: Statement) {
  if (statement.type === "ImportDeclaration") {
    for (const specifier of statement.specifiers) {
      if (specifier.type === "ImportSpecifier") {
        parsed.imports.set(specifier.local.name, {
          name: exportName(specifier.imported),
          source: statement.source.value,
        });
      }
    }

    return;
  }

  if (statement.type === "ExportNamedDeclaration") {
    for (const specifier of statement.specifiers) {
      parsed.exported.set(
        exportName(specifier.exported),
        exportName(specifier.local)
      );
    }

    return;
  }

  const name = declaredName(statement);

  if (name === undefined) {
    return;
  }

  const existing = parsed.declarations.get(name);

  if (existing) {
    existing.push(statement);
  } else {
    parsed.declarations.set(name, [statement]);
  }
}

function loadModule(file: string) {
  const cached = modules.get(file);

  if (cached) {
    return cached;
  }

  const code = readFileSync(file, "utf8");

  const { comments, program } = parseSync(file, code, {
    lang: file.endsWith(".d.mts") ? "dts" : "ts",
  });

  const parsed: Module = {
    code,
    comments,
    declarations: new Map(),
    exported: new Map(),
    file,
    imports: new Map(),
  };

  for (const statement of program.body) {
    collect(parsed, statement);
  }

  modules.set(file, parsed);

  return parsed;
}

function resolveExport(file: string, name: string): Resolved | undefined {
  const parsed = loadModule(file);
  const local = parsed.exported.get(name);

  if (local === undefined) {
    return undefined;
  }

  const nodes = parsed.declarations.get(local);

  if (nodes) {
    return { nodes, parsed };
  }

  const imported = parsed.imports.get(local);

  // Only follow the build's own chunks; types from other packages (eg `vite`) aren't ours to document.
  if (imported === undefined || !imported.source.startsWith(".")) {
    return undefined;
  }

  const source = imported.source.replace(/\.mjs$/, ".d.mts");

  return resolveExport(
    path.join(path.dirname(parsed.file), source),
    imported.name
  );
}

function docComment(parsed: Module, start: number) {
  const comment = parsed.comments.findLast(
    (candidate) =>
      candidate.end <= start &&
      candidate.type === "Block" &&
      candidate.value.startsWith("*")
  );

  if (
    comment === undefined ||
    parsed.code.slice(comment.end, start).trim() !== ""
  ) {
    return undefined;
  }

  return `/*${comment.value}*/`;
}

function withoutComments(parsed: Module, span: Span) {
  const parts: string[] = [];
  let cursor = span.start;

  for (const comment of parsed.comments) {
    if (comment.start >= span.start && comment.end <= span.end) {
      parts.push(parsed.code.slice(cursor, comment.start));
      cursor = comment.end;
    }
  }

  parts.push(parsed.code.slice(cursor, span.end));

  return parts
    .join("")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .join("\n")
    .replace(/^declare /, "");
}

function linkMarkdown(link: DocLinkTag) {
  if (link.urlDestination !== undefined) {
    return `[${link.linkText ?? link.urlDestination}](${link.urlDestination})`;
  }

  const target =
    link.codeDestination?.memberReferences
      .map((reference) => reference.memberIdentifier?.identifier ?? "")
      .join(".") ?? "";

  return `\`${link.linkText ?? target}\``;
}

function markdown(node: DocNode): string {
  if (node instanceof DocPlainText || node instanceof DocErrorText) {
    return node.text;
  }

  if (node instanceof DocEscapedText) {
    return node.decodedText;
  }

  if (node instanceof DocSoftBreak) {
    return " ";
  }

  if (node instanceof DocCodeSpan) {
    return `\`${node.code}\``;
  }

  if (node instanceof DocLinkTag) {
    return linkMarkdown(node);
  }

  if (node instanceof DocFencedCode) {
    return `\n\n\`\`\`${node.language}\n${node.code}\`\`\`\n\n`;
  }

  const children = node.getChildNodes().map(markdown).join("");

  return node instanceof DocParagraph
    ? `${children.replace(/ +/g, " ").trim()}\n\n`
    : children;
}

function tidy(value: string) {
  return value.replace(/\n{3,}/g, "\n\n").trim();
}

function parseDoc(comment: string): Doc {
  const { docComment: parsed } = parser.parseString(comment);
  const blocks = parsed.customBlocks;

  const defaultBlock = blocks.find(
    (block) => block.blockTag.tagName === "@default"
  );

  return {
    defaultValue:
      defaultBlock === undefined
        ? undefined
        : tidy(markdown(defaultBlock.content)),
    examples: blocks.flatMap((block) =>
      block.blockTag.tagName === "@example"
        ? [tidy(markdown(block.content))]
        : []
    ),
    internal: parsed.modifierTagSet.isInternal(),
    params: new Map(
      parsed.params.blocks.map((block) => [
        block.parameterName,
        tidy(markdown(block.content)),
      ])
    ),
    returns:
      parsed.returnsBlock === undefined
        ? undefined
        : tidy(markdown(parsed.returnsBlock.content)),
    summary: tidy(markdown(parsed.summarySection)),
  };
}

function inlineCode(value: string) {
  const fence = value.includes("`") ? "``" : "`";

  return `${fence}${value}${fence}`;
}

function codeRun(value: string) {
  const core = value.trim();

  if (core === "") {
    return value === "" ? "" : " ";
  }

  const before = value.startsWith(" ") ? " " : "";
  const after = value.endsWith(" ") ? " " : "";

  return `${before}${inlineCode(core)}${after}`;
}

/** A type as Markdown: code, with the names of documented exports linked to their pages. */
function typeMarkdown(type: string) {
  const parts: string[] = [];
  let plain = "";

  const tokens = type.replace(/\s+/g, " ").split(/(\b[A-Za-z_]\w*\b)/);

  for (const [index, token] of tokens.entries()) {
    const url = links.get(token);
    // A name followed by `:` or `?:` is a property key, not a reference to the export.
    const isKey = /^\??\s*:/.test(tokens[index + 1] ?? "");

    if (url === undefined || isKey) {
      plain += token;
      continue;
    }

    parts.push(codeRun(plain), `[${inlineCode(token)}](${url})`);
    plain = "";
  }

  parts.push(codeRun(plain));

  return parts.join("");
}

function codeBlock(code: string) {
  return `\`\`\`ts\n${code}\n\`\`\``;
}

function docParts(doc: Doc | undefined) {
  if (doc === undefined) {
    return [];
  }

  return [
    doc.summary,
    doc.defaultValue === undefined ? "" : `Default: \`${doc.defaultValue}\``,
    ...doc.examples,
  ];
}

function lineOf(parsed: Module, start: number) {
  return parsed.code.slice(0, start).split("\n").length;
}

function definedIn(declaration: SourceDeclaration, start: number) {
  const line = lineOf(declaration.source, start);
  const label = declaration.file.replace(/^src\//, "");

  return `Defined in: [${label}:${line}](${repository}/${declaration.file}#L${line})`;
}

function sourceDeclaration({ nodes, parsed }: Resolved) {
  const [first] = nodes;

  if (first === undefined) {
    return undefined;
  }

  // The build keeps `//#region src/<file>.d.ts` markers around each source file's declarations.
  const region = parsed.comments.findLast(
    (comment) =>
      comment.type === "Line" &&
      comment.start < first.start &&
      comment.value.startsWith("#region ")
  );

  const name = declaredName(first);

  if (region === undefined || name === undefined) {
    return undefined;
  }

  const file = region.value.slice("#region ".length).replace(/\.d\.ts$/, ".ts");

  const source = loadModule(path.join(packageRoot, file));
  const node = source.declarations.get(name)?.[0];

  return node === undefined ? undefined : { file, node, source };
}

function memberBody(node: Statement): readonly Member[] {
  if (
    node.type === "TSInterfaceDeclaration" ||
    node.type === "ClassDeclaration"
  ) {
    return node.body.body;
  }

  return [];
}

function memberName(member: Member) {
  if (
    !("key" in member) ||
    member.computed ||
    member.key.type !== "Identifier"
  ) {
    return undefined;
  }

  return member.key.name;
}

function memberCategory(member: Member) {
  switch (member.type) {
    case "MethodDefinition": {
      return member.kind === "constructor" ? "Constructors" : "Methods";
    }

    case "TSMethodSignature": {
      return "Methods";
    }

    case "PropertyDefinition":
    case "TSPropertySignature": {
      return "Properties";
    }

    default: {
      return undefined;
    }
  }
}

function memberHeading(member: Member, name: string, category: string) {
  if (category === "Constructors") {
    return "Constructor";
  }

  if (category === "Methods") {
    return `${name}()`;
  }

  return "optional" in member && member.optional === true ? `${name}?` : name;
}

function memberGroups(node: Statement) {
  const groups: MemberGroup[] = [];

  for (const member of memberBody(node)) {
    const name = memberName(member);
    const category = memberCategory(member);

    if (name === undefined || category === undefined) {
      continue;
    }

    const last = groups.at(-1);

    // Overloads sit next to each other and share one heading.
    if (last?.name === name && last.category === category) {
      last.nodes.push(member);
    } else {
      groups.push({
        category,
        heading: memberHeading(member, name, category),
        name,
        nodes: [member],
      });
    }
  }

  return groups;
}

function memberSection(
  item: Item,
  declaration: SourceDeclaration | undefined,
  group: MemberGroup
) {
  const { parsed } = item.resolved;
  const parts = [`### ${group.heading}`];

  const sourceMembers =
    declaration === undefined
      ? []
      : memberBody(declaration.node).filter(
          (member) => memberName(member) === group.name
        );

  for (const [index, node] of group.nodes.entries()) {
    const sourceMember = sourceMembers[index];
    const comment = docComment(parsed, node.start);

    parts.push(
      codeBlock(withoutComments(parsed, node)),
      declaration === undefined || sourceMember === undefined
        ? ""
        : definedIn(declaration, sourceMember.start),
      ...docParts(comment === undefined ? undefined : parseDoc(comment))
    );
  }

  return parts.filter((part) => part !== "").join("\n\n");
}

function memberSections(
  item: Item,
  declaration: SourceDeclaration | undefined
) {
  const [first] = item.resolved.nodes;
  const groups = first === undefined ? [] : memberGroups(first);

  return memberCategories.flatMap((category) => {
    const sections = groups.flatMap((group) =>
      group.category === category
        ? [memberSection(item, declaration, group)]
        : []
    );

    return sections.length === 0
      ? []
      : [`## ${category}`, sections.join("\n\n***\n\n")];
  });
}

function parameterSections(item: Item, node: FunctionNode) {
  if (node.params.length === 0) {
    return [];
  }

  const { parsed } = item.resolved;
  const sections = ["## Parameters"];

  for (const param of node.params) {
    const annotation =
      "typeAnnotation" in param ? param.typeAnnotation : undefined;

    const binding = parsed.code
      .slice(param.start, annotation ? annotation.start : param.end)
      .trim();

    const name = binding.replace(/\?$/, "");

    sections.push(
      `### ${binding}`,
      annotation
        ? typeMarkdown(withoutComments(parsed, annotation.typeAnnotation))
        : "",
      item.doc?.params.get(name) ?? ""
    );
  }

  return sections;
}

function returnsSection(item: Item, node: FunctionNode) {
  if (!node.returnType) {
    return [];
  }

  return [
    "## Returns",
    typeMarkdown(
      withoutComments(item.resolved.parsed, node.returnType.typeAnnotation)
    ),
    item.doc?.returns ?? "",
  ];
}

function extendsSection(node: Statement) {
  if (
    node.type !== "ClassDeclaration" ||
    node.superClass?.type !== "Identifier"
  ) {
    return [];
  }

  return ["## Extends", `- ${typeMarkdown(node.superClass.name)}`];
}

function frontmatter(fields: readonly string[]) {
  return [
    "---",
    "# Generated by scripts/api-reference.ts from the tomekit build. Do not edit.",
    ...fields,
    "---",
  ].join("\n");
}

function url(item: Item) {
  return `/docs/${item.entry.slug}/${item.kind.directory}/${item.name}`;
}

function itemPage(item: Item) {
  const { doc, kind, name, resolved } = item;
  const [first] = resolved.nodes;
  const declaration = sourceDeclaration(resolved);

  // Like the reference docs: classes and interfaces show each member's signature instead of one block.
  const signature =
    kind.kind === "Class" || kind.kind === "Interface"
      ? ""
      : codeBlock(
          resolved.nodes
            .map((node) => withoutComments(resolved.parsed, node))
            .join("\n")
        );

  const parts = [
    frontmatter([`kind: ${kind.kind}`, `name: ${name}`]),
    signature,
    declaration === undefined
      ? ""
      : definedIn(declaration, declaration.node.start),
    doc?.summary ?? "",
    ...(first === undefined ? [] : extendsSection(first)),
    ...(first?.type === "TSDeclareFunction"
      ? [...parameterSections(item, first), ...returnsSection(item, first)]
      : []),
    ...(doc === undefined || doc.examples.length === 0
      ? []
      : ["## Example", ...doc.examples]),
    ...memberSections(item, declaration),
  ];

  return `${parts.filter((part) => part !== "").join("\n\n")}\n`;
}

function indexPage(entry: Entry, items: readonly Item[]) {
  const groups = kinds.flatMap((kind) => {
    const lines = items.flatMap((item) =>
      item.entry === entry && item.kind === kind
        ? [`- [${item.name}](${url(item)})`]
        : []
    );

    return lines.length === 0 ? [] : [`## ${kind.heading}`, lines.join("\n")];
  });

  const fields = [
    `title: ${entry.title}`,
    `description: ${entry.description}`,
    "section: API reference",
    `order: ${entry.order}`,
  ];

  return `${frontmatter(fields)}\n\n${groups.join("\n\n")}\n`;
}

function collectItems(entry: Entry): Item[] {
  const file = path.join(dist, entry.file);

  return [...loadModule(file).exported.keys()].flatMap((name) => {
    const resolved = resolveExport(file, name);
    const first = resolved?.nodes[0];

    const kind = kinds.find(
      (info) => first !== undefined && info.kind === nodeKinds.get(first.type)
    );

    if (resolved === undefined || first === undefined || kind === undefined) {
      return [];
    }

    const comment = docComment(resolved.parsed, first.start);
    const doc = comment === undefined ? undefined : parseDoc(comment);

    return doc?.internal === true ? [] : [{ doc, entry, kind, name, resolved }];
  });
}

if (!existsSync(dist)) {
  throw new Error(
    `${dist} does not exist. Build tomekit first: vp run tomekit#build`
  );
}

const items = entries
  .flatMap(collectItems)
  .toSorted((a, b) => a.name.localeCompare(b.name));

for (const item of items) {
  if (!links.has(item.name)) {
    links.set(item.name, url(item));
  }
}

rmSync(referenceOutput, { force: true, recursive: true });

for (const entry of entries) {
  writeFileSync(
    path.join(docsOutput, `${entry.slug}.md`),
    indexPage(entry, items)
  );
}

for (const item of items) {
  const file = path.join(
    referenceOutput,
    item.entry.slug,
    item.kind.directory,
    `${item.name}.md`
  );

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, itemPage(item));
}
