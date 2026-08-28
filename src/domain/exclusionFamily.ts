/** 忌口按冻结品类展开。persist 仍存勾选的 SKU，不升 version。 */
export const CHICKEN_MEAT_IDS = [
  "chicken-breast",
  "chicken-thigh",
  "chicken-feet",
] as const;

const FAMILIES: readonly (readonly string[])[] = [CHICKEN_MEAT_IDS];

export function familyOf(id: string): readonly string[] | null {
  return FAMILIES.find((family) => family.includes(id)) ?? null;
}

export function effectiveExcludedIds(ids: readonly string[]): string[] {
  const out = new Set(ids);
  for (const family of FAMILIES) {
    if (family.some((id) => out.has(id))) {
      for (const id of family) out.add(id);
    }
  }
  return [...out];
}

/** 点族内任一 id：有效排除已全开则全关，否则全开。 */
export function toggleExclusionFamily(
  ids: readonly string[],
  id: string,
): string[] {
  const family = familyOf(id) ?? [id];
  const effective = new Set(effectiveExcludedIds(ids));
  const currentlyOn = family.every((item) => effective.has(item));
  const next = new Set(ids);
  if (currentlyOn) {
    for (const item of family) next.delete(item);
  } else {
    for (const item of family) next.add(item);
  }
  return [...next];
}
