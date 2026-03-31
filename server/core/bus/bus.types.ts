import type { CoreEvents } from "./bus.types.core";
import type { SettingsEvents } from "./bus.types.settings";
import type { ChatEvents } from "./bus.types.chat";
import type { SvcEvents } from "./bus.types.svc";
import type { KtEvents } from "./bus.types.kt";
import type { SearchEvents } from "./bus.types.search";
import type { RoutineEvents } from "./bus.types.routine";

export interface BusEventMap extends CoreEvents, SettingsEvents, ChatEvents, SvcEvents, KtEvents, SearchEvents, RoutineEvents {}
