// Pure report math extracted from the reports service: category share of
// the month's kind total, and delta vs the previous month. Zero runtime deps.
export function categoryPercent(total: number, kindTotal: number): number {
  return kindTotal === 0 ? 0 : (total * 100) / kindTotal;
}

export function changeVsPrevious(
  currentTotal: number,
  previousTotal: number,
): number {
  return currentTotal - previousTotal;
}
