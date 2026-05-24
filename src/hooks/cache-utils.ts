export const MAX_SYMBOLS_IN_CACHE = 50;

export function setWithLRI<V>(map: Map<string, V>, key: string, value: V, capacity: number): void {
  if (!map.has(key) && map.size >= capacity) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
}
