import type { ReactElement } from "react";
import SortableTable from "../../components/chat/SortableTable";
import ExpandableBlock from "../../components/shared/ExpandableBlock";
import type { BlockRenderer } from "../markdownLexer";

export const tableRenderer: BlockRenderer = {
  type: "table",
  render(content: string, key: string): ReactElement {
    return (
      <ExpandableBlock key={key} type="table" content={content}>
        <SortableTable content={content} />
      </ExpandableBlock>
    );
  },
};
