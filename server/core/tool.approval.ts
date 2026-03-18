import type { EventBus } from "./bus";
import type { Logger } from "../logger.types";

const TIMEOUT_MS = 60_000;

/** UI prompt type for tool approval requests.
 * - `"confirm:yesno"` — simple yes/no dialog
 * - `"input:credentials"` — input fields, values stored to credential store on submit
 * - `"input:oauth"` — input fields + OAuth browser flow triggered on submit
 */
export type ApprovalRequestType = "confirm:yesno" | "input:credentials" | "input:oauth";

export function chooseApprovalRequestType(params: Record<string, unknown> | undefined): ApprovalRequestType {
  if (params?.oauth) return "input:oauth";
  if (params?.fields) return "input:credentials";
  return "confirm:yesno";
}

export interface ApprovalRule {
  scope: string;
  tool: string;
  message: string;
  match?: (target: string) => boolean;
  isAllowed?: (target: string) => boolean;
  persist?: (scope: string, tool: string, target: string) => Promise<void>;
}

export interface ApprovalField {
  name: string;
  label: string;
  type: string;
}

export interface ApprovalContext {
  chatId: string;
  turnId?: string;
  requestApproval(tool: string, label: string, extra?: ApprovalExtra): Promise<boolean>;
}

export interface ApprovalExtra {
  type?: ApprovalRequestType;
  service?: string;
  description?: string;
  fields?: ApprovalField[];
  link?: string;
  timeoutMs?: number;
  oauth?: { authUrl: string; tokenUrl: string; scopes: string[]; tokenKey: string };
}

export function createApprovalContext(approval: ToolApproval, role: string, chatId: string, turnId?: string): ApprovalContext {
  return {
    chatId,
    turnId,
    requestApproval(tool, label, extra?) {
      return approval.requestApproval(role, tool, label, { chatId, turnId }, extra);
    },
  };
}

export interface PendingApprovalInfo {
  requestId: string;
  type: ApprovalRequestType;
  service?: string;
  message: string;
  canPersist: boolean;
  timeoutMs: number;
  remainingMs: number;
  description?: string;
  fields?: ApprovalField[];
  link?: string;
}

interface PendingApproval {
  chatId: string;
  msgId: string;
  scope: string;
  tool: string;
  target: string;
  rule: ApprovalRule;
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
  startedAt: number;
}

/**
 * Generic tool approval gate. Rules are registered at startup.
 * Callers check `needsApproval` then `await requestApproval` which
 * pauses execution until the user approves, denies, or the timeout expires.
 */
export class ToolApproval {
  private rules: ApprovalRule[] = [];
  private pending = new Map<string, PendingApproval>();

  constructor(private bus: EventBus, private log: Logger) {
    bus.on("tool.approval.resolve", (data) => {
      this.resolveApproval(data.requestId, data.approved, data.persist ?? false);
    });
  }

  register(rule: ApprovalRule): void {
    this.rules.push(rule);
  }

  registerDefaultRules(): void {
  }

  /** Get the pending approval for a chat (if any), with remaining time. */
  getPending(chatId: string): PendingApprovalInfo | null {
    const now = Date.now();
    for (const [requestId, entry] of this.pending) {
      if (entry.chatId !== chatId) continue;
      const elapsed = now - entry.startedAt;
      const remaining = Math.max(0, TIMEOUT_MS - elapsed);
      return { requestId, message: entry.rule.message, canPersist: !!entry.rule.persist, timeoutMs: TIMEOUT_MS, remainingMs: remaining };
    }
    return null;
  }

  /** Deny all pending approvals for a chat (e.g. when user stops the chat). */
  denyAll(chatId: string): void {
    for (const [requestId, entry] of this.pending) {
      if (entry.chatId !== chatId) continue;
      clearTimeout(entry.timer);
      this.pending.delete(requestId);
      this.log.info("Tool approval force-denied (chat stopped)", { requestId, chatId });
      this.emitActivity(entry.chatId, entry.msgId, "agent.approval.denied", {
        scope: entry.scope, tool: entry.tool, target: entry.target, reason: "stopped",
      });
      this.bus.emit("tool.approval.dismissed", { requestId, chatId });
      entry.resolve(false);
    }
  }

  private findRule(scope: string, tool: string, target: string): ApprovalRule | null {
    for (const rule of this.rules) {
      if (rule.scope !== scope || rule.tool !== tool) continue;
      if (rule.match && !rule.match(target)) continue;
      return rule;
    }
    return null;
  }

  needsApproval(scope: string, tool: string, target: string): boolean {
    const rule = this.findRule(scope, tool, target);
    if (!rule) return false;
    if (rule.isAllowed?.(target)) return false;
    return true;
  }

  async requestApproval(scope: string, tool: string, target: string, ctx: { chatId: string; turnId?: string }, extra?: {
    type?: ApprovalRequestType;
    service?: string;
    description?: string;
    fields?: ApprovalField[];
    link?: string;
    timeoutMs?: number;
    oauth?: { authUrl: string; tokenUrl: string; scopes: string[]; tokenKey: string };
  }): Promise<boolean> {
    const rule = this.findRule(scope, tool, target);
    if (!rule && !extra) return true;

    const requestId = crypto.randomUUID();
    const msgId = ctx.turnId ?? requestId;
    const message = rule?.message ?? target;
    const timeout = extra?.timeoutMs ?? TIMEOUT_MS;

    this.emitActivity(ctx.chatId, msgId, "agent.approval.requested", { scope, tool, target, message });

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.log.warn("Tool approval timeout", { requestId, scope, tool, target });
        this.pending.delete(requestId);
        this.emitActivity(ctx.chatId, msgId, "agent.approval.denied", { scope, tool, target, reason: "timeout" });
        this.bus.emit("tool.approval.dismissed", { requestId, chatId: ctx.chatId });
        resolve(false);
      }, timeout);

      this.pending.set(requestId, { chatId: ctx.chatId, msgId, scope, tool, target, rule: rule ?? { scope, tool, message }, resolve, timer, startedAt: Date.now() });

      this.bus.emit("tool.approval.request", {
        requestId,
        chatId: ctx.chatId,
        type: extra?.type ?? "confirm:yesno",
        message,
        scope,
        tool,
        target,
        canPersist: !!rule?.persist,
        timeoutMs: timeout,
        remainingMs: timeout,
        ...(extra?.service ? { service: extra.service } : {}),
        ...(extra?.description ? { description: extra.description } : {}),
        ...(extra?.fields ? { fields: extra.fields } : {}),
        ...(extra?.link ? { link: extra.link } : {}),
        ...(extra?.oauth ? { oauth: extra.oauth } : {}),
      });
      this.log.info("Tool approval requested", { requestId, scope, tool, target });
    });
  }

  private async resolveApproval(requestId: string, approved: boolean, persist: boolean) {
    const entry = this.pending.get(requestId);
    if (!entry) {
      this.log.warn("Tool approval resolve: unknown requestId", { requestId });
      return;
    }
    clearTimeout(entry.timer);
    this.pending.delete(requestId);

    if (approved && persist && entry.rule.persist) {
      try {
        await entry.rule.persist(entry.scope, entry.tool, entry.target);
        this.log.info("Tool approval persisted", { scope: entry.scope, tool: entry.tool, target: entry.target });
      } catch (err) {
        this.log.error("Tool approval persist failed", { error: String(err) });
      }
    }

    this.log.info("Tool approval resolved", { requestId, approved, persist });

    const activityType = approved ? "agent.approval.approved" : "agent.approval.denied";
    this.emitActivity(entry.chatId, entry.msgId, activityType, { scope: entry.scope, tool: entry.tool, target: entry.target });
    this.bus.emit("tool.approval.dismissed", { requestId, chatId: entry.chatId });

    entry.resolve(approved);
  }

  private emitActivity(chatId: string, messageId: string, type: string, data?: Record<string, unknown>) {
    this.bus.emit("chat.event", {
      chatId,
      kind: "activity",
      messageId,
      source: "agent",
      type,
      timestamp: new Date().toISOString(),
      ...(data ? { data } : {}),
    });
  }
}
