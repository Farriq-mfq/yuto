// Pure transaction validation rules extracted from the transactions
// service. Integer rupiah only; an empty/missing item list means "no
// breakdown" and skips the sum check (same rule as the service).
export interface PricedItem {
  readonly quantity: number;
  readonly unitPrice: number;
}

export function itemsTotal(items: readonly PricedItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

export function itemsSumMatches(
  items: readonly PricedItem[] | undefined,
  amount: number,
): boolean {
  if (items === undefined || items.length === 0) return true;
  return itemsTotal(items) === amount;
}

export function kindMatchesCategory(
  kind: string,
  categoryKind: string,
): boolean {
  return kind === categoryKind;
}
