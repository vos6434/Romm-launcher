/** Stable id for a collection row (manual / smart / virtual). */
export type CollectionKeyInput = {
  id: number | string;
  is_smart?: boolean;
  is_virtual?: boolean;
};

export function collectionRowKey(c: CollectionKeyInput): string {
  if (c.is_virtual) return `v-${c.id}`;
  if (c.is_smart) return `s-${c.id}`;
  return `r-${c.id}`;
}
