import { Elysia, t } from "elysia";
import { errorResponse } from "../../lib/errors";
import {
  TransactionInputError,
  createTransaction,
  deleteTransaction,
  getTransactionById,
  listTransactions,
  updateTransaction,
  type UpdateTransactionInput,
} from "./service";

const txKind = t.Union([t.Literal("expense"), t.Literal("income")]);

const txParams = t.Object({ id: t.String({ format: "uuid" }) });

const itemBody = t.Object({
  name: t.String({ minLength: 1 }),
  quantity: t.Integer({ minimum: 1 }),
  unitPrice: t.Integer({ minimum: 1 }),
});

const createTransactionBody = t.Object({
  accountId: t.String({ format: "uuid" }),
  categoryId: t.String({ format: "uuid" }),
  kind: txKind,
  title: t.String({ minLength: 1 }),
  amount: t.Integer({ minimum: 1 }),
  occurredAt: t.String({ minLength: 1 }),
  note: t.Optional(t.String()),
  locationName: t.Optional(t.String()),
  address: t.Optional(t.String()),
  latitude: t.Optional(t.Number()),
  longitude: t.Optional(t.Number()),
  items: t.Optional(t.Array(itemBody)),
});

const updateTransactionBody = t.Partial(createTransactionBody);

const listTransactionsQuery = t.Object({
  month: t.Optional(
    t.String({ pattern: "^(\\d{4})-(0[1-9]|1[0-2])$" }),
  ),
  kind: t.Optional(txKind),
  accountId: t.Optional(t.String({ format: "uuid" })),
  date: t.Optional(
    t.String({
      pattern: "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$",
    }),
  ),
});

function failureResponse(err: TransactionInputError) {
  switch (err.failure) {
    case "account-not-found":
      return { status: 404 as const, body: errorResponse("NOT_FOUND", err.message) };
    case "category-not-found":
      return { status: 404 as const, body: errorResponse("NOT_FOUND", err.message) };
    default:
      return { status: 400 as const, body: errorResponse("VALIDATION", err.message) };
  }
}

function parseOccurredAt(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function transactionRoutes() {
  return (
    new Elysia()
      .get(
        "/transactions",
        async ({ query, set }) => {
          try {
            return await listTransactions({
              month: query.month,
              kind: query.kind,
              accountId: query.accountId,
              date: query.date,
            });
          } catch (err) {
            if (err instanceof TransactionInputError) {
              const { status, body } = failureResponse(err);
              set.status = status;
              return body;
            }
            throw err;
          }
        },
        { query: listTransactionsQuery },
      )
      .post(
        "/transactions",
        async ({ body, set }) => {
          const occurredAt = parseOccurredAt(body.occurredAt);
          if (!occurredAt) {
            set.status = 400;
            return errorResponse(
              "VALIDATION",
              "Waktu transaksi tidak valid.",
            );
          }
          try {
            const created = await createTransaction({
              accountId: body.accountId,
              categoryId: body.categoryId,
              kind: body.kind,
              title: body.title,
              amount: body.amount,
              occurredAt,
              note: body.note,
              locationName: body.locationName,
              address: body.address,
              latitude: body.latitude,
              longitude: body.longitude,
              items: body.items,
            });
            set.status = 201;
            return created;
          } catch (err) {
            if (err instanceof TransactionInputError) {
              const { status, body: errorBody } = failureResponse(err);
              set.status = status;
              return errorBody;
            }
            throw err;
          }
        },
        { body: createTransactionBody },
      )
      .get(
        "/transactions/:id",
        async ({ params, set }) => {
          const found = await getTransactionById(params.id);
          if (!found) {
            set.status = 404;
            return errorResponse("NOT_FOUND", "Transaksi tidak ditemukan.");
          }
          return found;
        },
        { params: txParams },
      )
      .patch(
        "/transactions/:id",
        async ({ params, body, set }) => {
          const patch: UpdateTransactionInput = {};
          if (body.accountId !== undefined) patch.accountId = body.accountId;
          if (body.categoryId !== undefined)
            patch.categoryId = body.categoryId;
          if (body.kind !== undefined) patch.kind = body.kind;
          if (body.title !== undefined) patch.title = body.title;
          if (body.amount !== undefined) patch.amount = body.amount;
          if (body.note !== undefined) patch.note = body.note;
          if (body.locationName !== undefined)
            patch.locationName = body.locationName;
          if (body.address !== undefined) patch.address = body.address;
          if (body.latitude !== undefined) patch.latitude = body.latitude;
          if (body.longitude !== undefined) patch.longitude = body.longitude;
          if (body.items !== undefined) patch.items = body.items;
          if (body.occurredAt !== undefined) {
            const occurredAt = parseOccurredAt(body.occurredAt);
            if (!occurredAt) {
              set.status = 400;
              return errorResponse(
                "VALIDATION",
                "Waktu transaksi tidak valid.",
              );
            }
            patch.occurredAt = occurredAt;
          }
          try {
            const updated = await updateTransaction(params.id, patch);
            if (!updated) {
              set.status = 404;
              return errorResponse(
                "NOT_FOUND",
                "Transaksi tidak ditemukan.",
              );
            }
            return updated;
          } catch (err) {
            if (err instanceof TransactionInputError) {
              const { status, body: errorBody } = failureResponse(err);
              set.status = status;
              return errorBody;
            }
            throw err;
          }
        },
        { params: txParams, body: updateTransactionBody },
      )
      .delete(
        "/transactions/:id",
        async ({ params, set }) => {
          const deleted = await deleteTransaction(params.id);
          if (!deleted) {
            set.status = 404;
            return errorResponse("NOT_FOUND", "Transaksi tidak ditemukan.");
          }
          return { ok: true as const };
        },
        { params: txParams },
      )
  );
}
