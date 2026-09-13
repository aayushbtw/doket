type Comparable = Date | number | string;

type ElementOf<TValue> = TValue extends readonly (infer TElement)[]
  ? TElement
  : never;

type Operators<TValue> = {
  equals?: TValue;
  in?: readonly TValue[];
  not?: TValue;
  notIn?: readonly TValue[];
} & (NonNullable<TValue> extends readonly unknown[]
  ? { has?: ElementOf<NonNullable<TValue>> }
  : unknown) &
  (NonNullable<TValue> extends string
    ? { contains?: string; endsWith?: string; startsWith?: string }
    : unknown) &
  (NonNullable<TValue> extends Comparable
    ? {
        gt?: NonNullable<TValue>;
        gte?: NonNullable<TValue>;
        lt?: NonNullable<TValue>;
        lte?: NonNullable<TValue>;
      }
    : unknown);

type WhereObject<TDocument> = {
  [TKey in keyof TDocument]?: TDocument[TKey] | Operators<TDocument[TKey]>;
} & { NOT?: WhereObject<TDocument> };

/** Field filters, or a function for anything they cannot express. */
type Where<TDocument> =
  | WhereObject<TDocument>
  | ((document: TDocument) => boolean);

type OrderBy<TDocument> =
  | { [TKey in keyof TDocument]?: "asc" | "desc" }
  | readonly { [TKey in keyof TDocument]?: "asc" | "desc" }[];

interface FindManyArgs<TDocument> {
  orderBy?: OrderBy<TDocument>;
  /** How many matching documents to leave out from the start. */
  skip?: number;
  /** The most documents to return. */
  take?: number;
  where?: Where<TDocument>;
}

interface CollectionQuery<TDocument> {
  count: (args?: { where?: Where<TDocument> }) => number;
  findFirst: (
    args?: Omit<FindManyArgs<TDocument>, "take">
  ) => TDocument | undefined;
  /** Every matching document. With no arguments, the whole collection in file name order. */
  findMany: (args?: FindManyArgs<TDocument>) => TDocument[];
  findUnique: (args: { slug: string }) => TDocument | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

function comparable(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value;
}

function equal(a: unknown, b: unknown): boolean {
  return comparable(a) === comparable(b);
}

function compare(a: unknown, b: unknown): number {
  const left = comparable(a);
  const right = comparable(b);
  if (left === right) {
    return 0;
  }
  // Missing values sort last in either direction.
  if (left === undefined || left === null) {
    return 1;
  }
  if (right === undefined || right === null) {
    return -1;
  }
  if (typeof left === "string" && typeof right === "string") {
    return left.localeCompare(right);
  }
  return Number(left) < Number(right) ? -1 : 1;
}

function isPresent(value: unknown) {
  return value !== undefined && value !== null;
}

function bothStrings(
  value: unknown,
  operand: unknown
): [string, string] | undefined {
  return typeof value === "string" && typeof operand === "string"
    ? [value, operand]
    : undefined;
}

const OPERATORS: Record<string, (value: unknown, operand: unknown) => boolean> =
  {
    contains: (value, operand) => {
      const strings = bothStrings(value, operand);
      return strings !== undefined && strings[0].includes(strings[1]);
    },
    endsWith: (value, operand) => {
      const strings = bothStrings(value, operand);
      return strings !== undefined && strings[0].endsWith(strings[1]);
    },
    equals: equal,
    gt: (value, operand) => isPresent(value) && compare(value, operand) > 0,
    gte: (value, operand) => isPresent(value) && compare(value, operand) >= 0,
    has: (value, operand) =>
      Array.isArray(value) && value.some((entry) => equal(entry, operand)),
    in: (value, operand) =>
      Array.isArray(operand) && operand.some((entry) => equal(value, entry)),
    lt: (value, operand) => isPresent(value) && compare(value, operand) < 0,
    lte: (value, operand) => isPresent(value) && compare(value, operand) <= 0,
    not: (value, operand) => !equal(value, operand),
    notIn: (value, operand) =>
      Array.isArray(operand) && !operand.some((entry) => equal(value, entry)),
    startsWith: (value, operand) => {
      const strings = bothStrings(value, operand);
      return strings !== undefined && strings[0].startsWith(strings[1]);
    },
  };

function isOperators(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    Object.keys(value).length > 0 &&
    Object.keys(value).every((key) => Object.hasOwn(OPERATORS, key))
  );
}

function matches<TDocument>(
  document: TDocument,
  where: Where<TDocument>
): boolean {
  if (typeof where === "function") {
    return where(document);
  }
  if (!isRecord(where) || !isRecord(document)) {
    return true;
  }
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) {
      return true;
    }
    if (key === "NOT") {
      return !matches(document, condition as Where<TDocument>);
    }
    const value = document[key];
    if (isOperators(condition)) {
      return Object.entries(condition).every(
        ([operator, operand]) => OPERATORS[operator]?.(value, operand) ?? false
      );
    }
    return equal(value, condition);
  });
}

function sorter(orderBy: unknown) {
  const fields = (Array.isArray(orderBy) ? orderBy : [orderBy])
    .filter(isRecord)
    .flatMap((entry) => Object.entries(entry));
  return (a: unknown, b: unknown) => {
    for (const [key, direction] of fields) {
      const left = isRecord(a) ? a[key] : undefined;
      const right = isRecord(b) ? b[key] : undefined;
      const result = compare(left, right);
      if (result !== 0) {
        const missing = [left, right].some(
          (value) => value === undefined || value === null
        );
        return direction === "desc" && !missing ? -result : result;
      }
    }
    return 0;
  };
}

/**
 * Wraps a collection's documents in the query API. Used by the generated
 * `tomekit/content` module: each entry is `[slug, document]`.
 */
function createCollection<TDocument>(
  entries: readonly (readonly [string, TDocument])[]
): CollectionQuery<TDocument> {
  const documents = entries.map(([, document]) => document);
  const bySlug = new Map(entries);

  function findMany({
    orderBy,
    skip = 0,
    take,
    where,
  }: FindManyArgs<TDocument> = {}) {
    let result =
      where === undefined
        ? [...documents]
        : documents.filter((document) => matches(document, where));
    if (orderBy !== undefined) {
      result = result.toSorted(sorter(orderBy));
    }
    return result.slice(skip, take === undefined ? undefined : skip + take);
  }

  return {
    count: ({ where } = {}) =>
      where === undefined
        ? documents.length
        : documents.filter((document) => matches(document, where)).length,
    findFirst: (args = {}) => findMany({ ...args, take: 1 })[0],
    findMany,
    findUnique: ({ slug }) => bySlug.get(slug),
  };
}

export {
  type CollectionQuery,
  createCollection,
  type FindManyArgs,
  type OrderBy,
  type Where,
};
