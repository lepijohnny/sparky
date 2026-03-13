/**
 * Groups items by date bucket: Today, Yesterday, or a formatted date.
 * Items must have a date string (ISO or parseable by Date).
 */

export interface DateGroup<T> {
  label: string;
  items: T[];
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function groupByDate<T>(items: T[], getDate: (item: T) => string): DateGroup<T>[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => new Date(getDate(b)).getTime() - new Date(getDate(a)).getTime());

  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - 86_400_000;

  const groups: DateGroup<T>[] = [];
  let currentLabel = "";
  let currentItems: T[] = [];

  for (const item of sorted) {
    const d = new Date(getDate(item));
    const dayStart = startOfDay(d);

    let label: string;
    if (dayStart >= todayStart) {
      label = "Today";
    } else if (dayStart >= yesterdayStart) {
      label = "Yesterday";
    } else {
      label = d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    }

    if (label !== currentLabel) {
      if (currentItems.length > 0) {
        groups.push({ label: currentLabel, items: currentItems });
      }
      currentLabel = label;
      currentItems = [item];
    } else {
      currentItems.push(item);
    }
  }

  if (currentItems.length > 0) {
    groups.push({ label: currentLabel, items: currentItems });
  }

  return groups;
}
