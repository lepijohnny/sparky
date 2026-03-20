import type { ReactElement } from "react";
import MermaidBlock from "../../components/chat/MermaidBlock";
import CodeBlock from "../../components/chat/CodeBlock";
import ErrorBoundary from "../../components/shared/ErrorBoundary";
import ExpandableBlock from "../../components/shared/ExpandableBlock";
import type { BlockRenderer } from "../markdownLexer";

function RawFallback({ content }: { content: string }) {
  return <CodeBlock code={content} language="Failed to render Mermaid (Raw)" />;
}

export const mermaidRenderer: BlockRenderer = {
  type: "mermaid",
  render(content: string, key: string): ReactElement {
    return (
      <ErrorBoundary key={key} fallback={<RawFallback content={content} />}>
        <ExpandableBlock type="mermaid" content={content}>
          <MermaidBlock code={content} />
        </ExpandableBlock>
      </ErrorBoundary>
    );
  },
};
