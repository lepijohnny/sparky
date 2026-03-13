import type { ReactElement } from "react";
import CodeBlock from "../../components/chat/CodeBlock";
import type { BlockRenderer } from "../markdownLexer";

export const codeRenderer: BlockRenderer = {
  type: "code",
  render(content: string, key: string): ReactElement {
    return <CodeBlock key={key} code={content} />;
  },
};
