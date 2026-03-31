import type { ActionContext } from "../routine.action.types";
import { matchFilter, type FilterableChat } from "./routine.action.filter";

export async function execute({ bus, routine }: ActionContext): Promise<void> {
  if (routine.action.type !== "label") return;
  const { labelId, remove, filter } = routine.action;
  const { chats } = await bus.emit("chat.list.all", undefined) as { chats: FilterableChat[] };

  for (const chat of matchFilter(chats, filter)) {
    const current = chat.labels ?? [];
    const next = remove
      ? current.filter((l: string) => l !== labelId)
      : current.includes(labelId) ? current : [...current, labelId];
    await bus.emit("chat.label", { id: chat.id, labels: next });
  }
}
