import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { categories, transactions } from "../../db/schema";
import {
  JakartaTimeError,
  jakartaMonthRange,
  previousMonth,
} from "../../lib/jakarta-time";

export type ReportKind = "expense" | "income";

export type ReportFailure = "invalid-month";

export class ReportInputError extends Error {
  readonly failure: ReportFailure;

  constructor(failure: ReportFailure, message: string) {
    super(message);
    this.failure = failure;
  }
}

export interface MonthlySummary {
  month: string;
  income: number;
  expense: number;
  net: number;
}

export interface CategoryBreakdown {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  total: number;
  percent: number;
  previousTotal: number;
  change: number;
}

function monthRangeOrThrow(month: string): { start: Date; end: Date } {
  try {
    return jakartaMonthRange(month);
  } catch (err) {
    if (err instanceof JakartaTimeError) {
      throw new ReportInputError("invalid-month", err.message);
    }
    throw err;
  }
}

function previousMonthOrThrow(month: string): string {
  try {
    return previousMonth(month);
  } catch (err) {
    if (err instanceof JakartaTimeError) {
      throw new ReportInputError("invalid-month", err.message);
    }
    throw err;
  }
}

export async function getMonthlySummary(month: string): Promise<MonthlySummary> {
  const { start, end } = monthRangeOrThrow(month);
  // why: a transfer only moves money between the owner's own accounts, so it
  // is neither income nor expense. Same rule as the balance formula, which
  // nets transfers separately instead of counting them as transactions.
  const rows = await db
    .select({
      kind: transactions.kind,
      total: sql<number>`sum(${transactions.amount})`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(gte(transactions.occurredAt, start), lt(transactions.occurredAt, end)),
    )
    .groupBy(transactions.kind);
  let income = 0;
  let expense = 0;
  for (const row of rows) {
    if (row.kind === "income") income = row.total;
    else if (row.kind === "expense") expense = row.total;
  }
  return { month, income, expense, net: income - expense };
}

export async function getCategoryBreakdown(
  month: string,
  kind: ReportKind,
): Promise<CategoryBreakdown[]> {
  const { start, end } = monthRangeOrThrow(month);
  const { start: prevStart, end: prevEnd } = monthRangeOrThrow(
    previousMonthOrThrow(month),
  );

  const kindFilter = eq(transactions.kind, kind);
  const current = await db
    .select({
      categoryId: transactions.categoryId,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      total: sql<number>`sum(${transactions.amount})`.mapWith(Number),
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        kindFilter,
        gte(transactions.occurredAt, start),
        lt(transactions.occurredAt, end),
      ),
    )
    .groupBy(
      transactions.categoryId,
      categories.name,
      categories.icon,
      categories.color,
    );

  const previous = await db
    .select({
      categoryId: transactions.categoryId,
      total: sql<number>`sum(${transactions.amount})`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        kindFilter,
        gte(transactions.occurredAt, prevStart),
        lt(transactions.occurredAt, prevEnd),
      ),
    )
    .groupBy(transactions.categoryId);
  const previousById = new Map(previous.map((row) => [row.categoryId, row.total]));

  const kindTotal = current.reduce((sum, row) => sum + row.total, 0);
  // Only categories with spending this month are listed: enough for the UI,
  // which shows this month's breakdown, and it keeps the response small.
  return current
    .filter((row) => row.total > 0)
    .map((row) => {
      const previousTotal = previousById.get(row.categoryId) ?? 0;
      return {
        categoryId: row.categoryId,
        name: row.name,
        icon: row.icon,
        color: row.color,
        total: row.total,
        percent: kindTotal === 0 ? 0 : (row.total * 100) / kindTotal,
        previousTotal,
        change: row.total - previousTotal,
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
