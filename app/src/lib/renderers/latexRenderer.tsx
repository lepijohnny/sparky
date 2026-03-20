import type { ReactElement } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import CodeBlock from "../../components/chat/CodeBlock";
import ErrorBoundary from "../../components/shared/ErrorBoundary";
import ExpandableBlock from "../../components/shared/ExpandableBlock";
import type { BlockRenderer } from "../markdownLexer";

function RawFallback({ content }: { content: string }) {
  return <CodeBlock code={content} language="Failed to render LaTeX (Raw)" />;
}

export const latexRenderer: BlockRenderer = {
  type: "latex",
  render(content: string, key: string): ReactElement {
    try {
      const html = katex.renderToString(content, { displayMode: true, throwOnError: false });
      return (
        <ErrorBoundary key={key} fallback={<RawFallback content={content} />}>
          <ExpandableBlock type="latex" content={content}>
            <div className="latexBlock" dangerouslySetInnerHTML={{ __html: html }} />
          </ExpandableBlock>
        </ErrorBoundary>
      );
    } catch {
      return <RawFallback content={content} />;
    }
  },
};
