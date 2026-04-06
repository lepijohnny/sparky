import type { ReactElement } from "react";
import HtmlBlock from "../../components/chat/HtmlBlock";
import ErrorBoundary from "../../components/shared/ErrorBoundary";
import CodeBlock from "../../components/chat/CodeBlock";
import type { BlockRenderer } from "../markdownLexer";

function RawFallback({ content }: { content: string }) {
  return <CodeBlock code={content} language="html" />;
}

export const htmlRenderer: BlockRenderer = {
  type: "html",
  render(content: string, key: string): ReactElement {
    return (
      <ErrorBoundary key={key} fallback={<RawFallback content={content} />}>
        <HtmlBlock code={content} />
      </ErrorBoundary>
    );
  },
};
