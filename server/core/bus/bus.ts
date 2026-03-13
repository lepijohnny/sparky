import type { BusEventMap } from "./bus.types";
import type { Logger } from "../../logger.types";
import { validateBusEvent, BusValidationError } from "./bus.schemas";

type Handler<T, R = void> = T extends void
  ? () => R | Promise<R>
  : (data: T) => R | Promise<R>;

export interface EventBus {
  on<K extends keyof BusEventMap>(
    event: K,
    handler: Handler<BusEventMap[K]["req"], BusEventMap[K]["res"]>,
  ): () => void;

  subscribe<K extends keyof BusEventMap>(
    event: K,
    handler: Handler<BusEventMap[K]["req"], void>,
  ): () => void;

  emit<K extends keyof BusEventMap>(
    event: K,
    ...args: BusEventMap[K]["req"] extends void ? [] : [BusEventMap[K]["req"]]
  ): Promise<BusEventMap[K]["res"]>;
}

export function createEventBus(log: Logger): EventBus {
  const listeners = new Map<string, Set<Function>>();
  const subscribers = new Map<string, Set<Function>>();

  return {
    on(event, handler) {
      const existing = listeners.get(event);
      if (existing && existing.size > 0) {
        throw new Error(`Duplicate handler for "${event}" — only one handler per event is allowed. Use subscribe() for fan-out.`);
      }
      if (!existing) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(handler);
      log.debug(`Registered handler for "${event}"`);
      return () => { listeners.get(event)?.delete(handler); };
    },

    subscribe(event, handler) {
      if (!subscribers.has(event)) {
        subscribers.set(event, new Set());
      }
      subscribers.get(event)!.add(handler);
      log.debug(`Registered subscriber for "${event}"`);
      return () => { subscribers.get(event)?.delete(handler); };
    },

    async emit(event, ...args) {
      const handler = listeners.get(event)?.values().next().value as Function | undefined;
      const subs = subscribers.get(event);

      if (!handler && (!subs || subs.size === 0)) {
        log.warn(`No listeners for "${event}"`);
        return undefined as any;
      }

      const data = args[0];

      const validationError = validateBusEvent(event, data);
      if (validationError) {
        log.warn(`Bus validation failed for "${event}"`, { error: validationError.hint });
        throw validationError;
      }

      let result: any;
      if (handler) {
        try {
          result = await handler(data);
        } catch (err) {
          log.error(`Error in handler for "${event}"`, { error: String(err) });
          throw err;
        }
      }

      if (subs) {
        for (const sub of subs) {
          try {
            await sub(data);
          } catch (err) {
            log.error(`Error in subscriber for "${event}"`, { error: String(err) });
          }
        }
      }

      return result;
    },
  };
}
