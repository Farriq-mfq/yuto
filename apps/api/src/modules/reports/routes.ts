import { Elysia, t } from "elysia";
import { errorResponse } from "../../lib/errors";
import {
  ReportInputError,
  getCategoryBreakdown,
  getMonthlySummary,
  type ReportKind,
} from "./service";

const reportKind = t.Union([t.Literal("expense"), t.Literal("income")]);

const monthPattern = "^(\\d{4})-(0[1-9]|1[0-2])$";

const summaryQuery = t.Object({
  month: t.String({ pattern: monthPattern }),
});

const categoriesQuery = t.Object({
  month: t.String({ pattern: monthPattern }),
  kind: reportKind,
});

export function reportRoutes() {
  return new Elysia()
    .get(
      "/reports/summary",
      async ({ query, set }) => {
        try {
          return await getMonthlySummary(query.month);
        } catch (err) {
          if (err instanceof ReportInputError) {
            set.status = 400;
            return errorResponse("VALIDATION", err.message);
          }
          throw err;
        }
      },
      { query: summaryQuery },
    )
    .get(
      "/reports/categories",
      async ({ query, set }) => {
        try {
          return await getCategoryBreakdown(
            query.month,
            query.kind as ReportKind,
          );
        } catch (err) {
          if (err instanceof ReportInputError) {
            set.status = 400;
            return errorResponse("VALIDATION", err.message);
          }
          throw err;
        }
      },
      { query: categoriesQuery },
    );
}
