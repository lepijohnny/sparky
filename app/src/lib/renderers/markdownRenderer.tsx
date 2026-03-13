import React, { type ComponentPropsWithoutRef, type ReactElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { highlightText } from "../highlight";
import type { BlockRenderer } from "../markdownLexer";

type HlProps<T extends keyof JSX.IntrinsicElements> = ComponentPropsWithoutRef<T> & { children?: ReactNode };

function makeHighlighter(searchQuery: string) {
  const hl = (children: ReactNode): ReactNode => {
    if (typeof children === "string") return highlightText(children, searchQuery);
    if (Array.isArray(children)) return children.map((c, i) => typeof c === "string" ? <React.Fragment key={i}>{highlightText(c, searchQuery)}</React.Fragment> : c);
    return children;
  };

  return {
    p:      ({ children, ...props }: HlProps<"p">) => <p {...props}>{hl(children)}</p>,
    li:     ({ children, ...props }: HlProps<"li">) => <li {...props}>{hl(children)}</li>,
    td:     ({ children, ...props }: HlProps<"td">) => <td {...props}>{hl(children)}</td>,
    th:     ({ children, ...props }: HlProps<"th">) => <th {...props}>{hl(children)}</th>,
    strong: ({ children, ...props }: HlProps<"strong">) => <strong {...props}>{hl(children)}</strong>,
    em:     ({ children, ...props }: HlProps<"em">) => <em {...props}>{hl(children)}</em>,
  } satisfies Components;
}

export function createMarkdownRenderer(searchQuery?: string): BlockRenderer {
  const components: Components | undefined = searchQuery ? makeHighlighter(searchQuery) : undefined;

  return {
    type: "markdown",
    render(content: string, key: string): ReactElement {
      return (
        <ReactMarkdown key={key} remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]} components={components}>
          {content}
        </ReactMarkdown>
      );
    },
  };
}
