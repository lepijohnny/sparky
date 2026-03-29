export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "image"; filePath: string; mimeType: string }
  | { type: "document"; filePath: string; mimeType: string; filename: string };

export type MessageContent = string | MessagePart[];

export type AgentMessage =
  | { role: "user"; content: MessageContent }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface ToolBinary {
  data: string;
  mimeType: string;
  filename: string;
}

export interface ToolAttachment {
  text: string;
  binary?: ToolBinary[];
}

export interface AgentTools {
  defs: AgentToolDef[];
  execute: (name: string, args: Record<string, unknown>) => Promise<string | ToolAttachment>;
}

/** What the agent receives — everything it needs, stateless */
export interface AgentTurn {
  system: string;
  messages: AgentMessage[];
  cancellation: AbortSignal;
  tools?: AgentTools;

}

/** Tool definition passed to the agent for function calling */
export interface AgentToolDef {
  name: string;
  description: string;
  label: string;
  icon: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  category?: string;
  summarize?: (input: unknown, output: string) => string;
  friendlyLabel?: (input: unknown) => string;
  outputLimit?: number;
}

/** Events yielded by the agent stream */
export type AgentEvent =
  | { type: "text.delta"; content: string }
  | { type: "text.done"; content: string }
  | { type: "thinking.start" }
  | { type: "thinking.delta"; content: string }
  | { type: "thinking.done"; content: string }
  | { type: "tool.start"; id: string; name: string; input: unknown }
  | { type: "tool.result"; id: string; output: unknown }
  | { type: "tool.denied"; id: string }
  | { type: "server_tool.start"; id: string; name: string; input: unknown }
  | { type: "error"; message: string }
  | { type: "done" };

/** Agent interface — stateless, returns async stream */
export interface Agent {
  stream(input: AgentTurn): AsyncGenerator<AgentEvent>;
}






