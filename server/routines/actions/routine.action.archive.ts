import type { ActionContext } from "../routine.action.types";
import { matchFilter, type FilterableChat } from "./routine.action.filter";

export async function execute({ bus, routine }: ActionContext): Promise<void> {
  if (routine.action.type !== "archive") return;
  const { filter } = routine.action;
  const { chats } = await bus.emit("chat.list.all", undefined) as { chats: FilterableChat[] };

  for (const chat of matchFilter(chats, filter)) {
    await bus.emit("chat.archive", { id: chat.id, archived: true });
  }
}
