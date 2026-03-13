import type { ReactElement } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import ExpandableBlock from "../../components/shared/ExpandableBlock";
import type { BlockRenderer } from "../markdownLexer";

export const latexRenderer: BlockRenderer = {
  type: "latex",
  render(content: string, key: string): ReactElement {
    try {
      const html = katex.renderToString(content, { displayMode: true, throwOnError: false });
      return (
        <ExpandableBlock key={key} type="latex" content={content}>
          <div className="latexBlock" dangerouslySetInnerHTML={{ __html: html }} />
        </ExpandableBlock>
      );
    } catch {
      return <pre key={key}>{content}</pre>;
    }
  },
};
