import type { Logger } from "../logger.types";

interface CompatStep {
  name: string;
  run: () => void | Promise<void>;
}

export function configJsonBackwardCompatibilityHook(log: Logger, steps: CompatStep[]): void {
  for (const step of steps) {
    try {
      step.run();
    } catch (err) {
      log.warn(`Compat step "${step.name}" failed: ${err}`);
    }
  }
}
