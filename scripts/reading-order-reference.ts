/** Previous array algorithm, retained only as an independent test/benchmark oracle. */
export function legacyReadingOrder(previous: string[], visual: string[]): string[] {
  const present = new Set(visual), order = previous.filter(id => present.has(id));
  const known = new Set(order);
  for (let index = 0; index < visual.length; index++) {
    const id = visual[index]; if (known.has(id)) continue;
    let before = index - 1;
    while (before >= 0 && !known.has(visual[before])) before--;
    if (before < 0) order.unshift(id); else order.splice(order.indexOf(visual[before]) + 1, 0, id);
    known.add(id);
  }
  return order;
}
