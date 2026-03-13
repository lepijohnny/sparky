import type { ReactElement } from "react";
import ChartBlock from "../../components/chat/ChartBlock";
import ExpandableBlock from "../../components/shared/ExpandableBlock";
import type { BlockRenderer } from "../markdownLexer";

export const chartRenderer: BlockRenderer = {
  type: "chart",
  render(content: string, key: string): ReactElement {
    return (
      <ExpandableBlock key={key} type="chart" content={content}>
        <ChartBlock code={content} />
      </ExpandableBlock>
    );
  },
};
