import type { ReactElement } from "react";
import MermaidBlock from "../../components/chat/MermaidBlock";
import ExpandableBlock from "../../components/shared/ExpandableBlock";
import type { BlockRenderer } from "../markdownLexer";

export const mermaidRenderer: BlockRenderer = {
  type: "mermaid",
  render(content: string, key: string): ReactElement {
    return (
      <ExpandableBlock key={key} type="mermaid" content={content}>
        <MermaidBlock code={content} />
      </ExpandableBlock>
    );
  },
};
