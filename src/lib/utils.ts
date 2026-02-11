export function pickOne<T>(items: T[]): T {
  if (items.length === 0) {
    throw new Error("Cannot pick from empty array");
  }

  return items[Math.floor(Math.random() * items.length)];
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

