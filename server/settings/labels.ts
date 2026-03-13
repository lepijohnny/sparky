import type { EventBus } from "../core/bus";
import type { ConfigManager } from "../core/config";
import type { Logger } from "../logger.types";
import type { Label } from "./labels.types";

const PALETTE = [
  "hsl(340, 65%, 60%)", // rose
  "hsl(20, 70%, 55%)",  // orange
  "hsl(40, 75%, 55%)",  // amber
  "hsl(80, 55%, 50%)",  // lime
  "hsl(150, 50%, 45%)", // emerald
  "hsl(175, 55%, 45%)", // teal
  "hsl(195, 65%, 50%)", // cyan
  "hsl(215, 65%, 55%)", // blue
  "hsl(240, 55%, 60%)", // indigo
  "hsl(265, 50%, 60%)", // violet
  "hsl(285, 45%, 55%)", // purple
  "hsl(320, 55%, 60%)", // pink
];

export class LabelsSettings {
  constructor(
    private bus: EventBus,
    private config: ConfigManager,
    private log: Logger,
  ) {
    this.bus.on("settings.labels.list", () => this.list());
    this.bus.on("settings.labels.create", (data) => this.create(data));
    this.bus.on("settings.labels.update", (data) => this.update(data));
    this.bus.on("settings.labels.delete", (data) => this.delete(data));
    this.bus.on("settings.labels.reorder", (data) => this.reorder(data));
  }

  private list() {
    const labels = this.config.get("labels") ?? [];
    return { labels };
  }

  private async create(data: { name: string; color?: string }) {
    const existing = this.config.get("labels") ?? [];
    const color = data.color ?? PALETTE[existing.length % PALETTE.length];
    const label: Label = {
      id: crypto.randomUUID(),
      name: data.name.trim(),
      color,
    };

    await this.config.update("labels", (labels: Label[] = []) => [...labels, label]);
    this.log.info(`Label created: ${label.name}`);
    this.bus.emit("settings.labels.created", { label });
    return { label };
  }

  private async update(data: { id: string; name?: string; color?: string }) {
    let updated: Label | null = null;

    await this.config.update("labels", (labels = []) =>
      labels.map((l) => {
        if (l.id !== data.id) return l;
        const next: Label = {
          ...l,
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.color !== undefined ? { color: data.color } : {}),
        };
        updated = next;
        return next;
      }),
    );

    if (!updated) throw new Error(`Label not found: ${data.id}`);
    this.log.info(`Label updated: ${(updated as Label).name}`);
    this.bus.emit("settings.labels.updated", { label: updated as Label });
    return { label: updated as Label };
  }

  private async reorder(data: { ids: string[] }) {
    const existing = this.config.get("labels") ?? [];
    const map = new Map(existing.map((l) => [l.id, l]));
    const reordered = data.ids
      .map((id) => map.get(id))
      .filter((l): l is Label => l !== undefined);

    await this.config.set("labels", reordered);
    this.log.info("Labels reordered");
    return { labels: reordered };
  }

  private async delete(data: { id: string }) {
    let found = false;

    await this.config.update("labels", (labels: Label[] = []) => {
      const filtered = labels.filter((l) => {
        if (l.id === data.id) { found = true; return false; }
        return true;
      });
      return filtered;
    });

    if (!found) return { deleted: false };

    this.log.info(`Label deleted: ${data.id}`);
    this.bus.emit("settings.labels.deleted", { id: data.id });
    return { deleted: true };
  }
}
