import { type ReactElement, useState, useCallback } from "react";
import ChartBlock from "../../components/chat/ChartBlock";
import CodeBlock from "../../components/chat/CodeBlock";
import ErrorBoundary from "../../components/shared/ErrorBoundary";
import ExpandableBlock from "../../components/shared/ExpandableBlock";
import type { BlockRenderer } from "../markdownLexer";

function RawFallback({ content }: { content: string }) {
  return <CodeBlock code={content} language="Failed to render EChart (Raw)" />;
}

function ChartWithFallback({ content, renderKey }: { content: string; renderKey: string }) {
  const [failed, setFailed] = useState(false);
  const handleError = useCallback(() => setFailed(true), []);

  if (failed) {
    return <RawFallback content={content} />;
  }

  return (
    <ExpandableBlock key={renderKey} type="chart" content={content}>
      <ChartBlock code={content} onError={handleError} />
    </ExpandableBlock>
  );
}

export const chartRenderer: BlockRenderer = {
  type: "chart",
  render(content: string, key: string): ReactElement {
    return (
      <ErrorBoundary key={key} fallback={<RawFallback content={content} />}>
        <ChartWithFallback content={content} renderKey={key} />
      </ErrorBoundary>
    );
  },
};
