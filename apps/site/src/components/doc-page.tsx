import { Article } from "#/components/article";
import { PageNav } from "#/components/page-nav";
import type { getDoc } from "#/lib/docs";

interface DocPageProps {
  doc: Awaited<ReturnType<typeof getDoc>>;
}

function DocPage({ doc: { body, metadata, next, previous } }: DocPageProps) {
  return (
    <Article
      body={body}
      description={metadata.description}
      headings={metadata.headings}
      title={metadata.title}
    >
      <PageNav next={next} previous={previous} />
    </Article>
  );
}

export { DocPage };
