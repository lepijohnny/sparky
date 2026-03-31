import type { ActionContext } from "../routine.action.types";

export async function execute({ bus, db, routine, run }: ActionContext): Promise<void> {
  if (routine.action.type !== "chat") return;
  const { prompt, provider, model } = routine.action;

  const createData: Record<string, unknown> = { name: routine.name, unread: true };
  if (provider) createData.provider = provider;
  if (model) createData.model = model;

  const { chat } = await bus.emit("chat.create", createData) as { chat: { id: string } };

  db.updateRoutineRun(run.id, { chatId: chat.id });

  await bus.emit("chat.ask", {
    chatId: chat.id,
    content: prompt,
  });
}
