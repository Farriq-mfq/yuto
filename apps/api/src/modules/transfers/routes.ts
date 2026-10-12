import { Elysia, t } from "elysia";
import { errorResponse } from "../../lib/errors";
import {
  TransferInputError,
  createTransfer,
  deleteTransfer,
  getTransferById,
  listTransfers,
} from "./service";

const transferParams = t.Object({ id: t.String({ format: "uuid" }) });

const createTransferBody = t.Object({
  fromAccountId: t.String({ format: "uuid" }),
  toAccountId: t.String({ format: "uuid" }),
  amount: t.Integer({ minimum: 1 }),
  note: t.Optional(t.String()),
  occurredAt: t.String({ minLength: 1 }),
});

const listTransfersQuery = t.Object({
  month: t.Optional(
    t.String({ pattern: "^(\\d{4})-(0[1-9]|1[0-2])$" }),
  ),
  accountId: t.Optional(t.String({ format: "uuid" })),
  limit: t.Optional(t.String({ pattern: "^[0-9]+$" })),
});

function failureResponse(err: TransferInputError) {
  switch (err.failure) {
    case "from-not-found":
    case "to-not-found":
      return { status: 404 as const, body: errorResponse("NOT_FOUND", err.message) };
    default:
      return { status: 400 as const, body: errorResponse("VALIDATION", err.message) };
  }
}

function parseOccurredAt(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function transferRoutes() {
  return (
    new Elysia()
      .get(
        "/transfers",
        async ({ query, set }) => {
          try {
            return await listTransfers({
              month: query.month,
              accountId: query.accountId,
              limit: query.limit === undefined ? undefined : Number(query.limit),
            });
          } catch (err) {
            if (err instanceof TransferInputError) {
              const { status, body } = failureResponse(err);
              set.status = status;
              return body;
            }
            throw err;
          }
        },
        { query: listTransfersQuery },
      )
      .post(
        "/transfers",
        async ({ body, set }) => {
          const occurredAt = parseOccurredAt(body.occurredAt);
          if (!occurredAt) {
            set.status = 400;
            return errorResponse("VALIDATION", "Waktu transfer tidak valid.");
          }
          try {
            const created = await createTransfer({
              fromAccountId: body.fromAccountId,
              toAccountId: body.toAccountId,
              amount: body.amount,
              note: body.note,
              occurredAt,
            });
            set.status = 201;
            return created;
          } catch (err) {
            if (err instanceof TransferInputError) {
              const { status, body: errorBody } = failureResponse(err);
              set.status = status;
              return errorBody;
            }
            throw err;
          }
        },
        { body: createTransferBody },
      )
      .get(
        "/transfers/:id",
        async ({ params, set }) => {
          const found = await getTransferById(params.id);
          if (!found) {
            set.status = 404;
            return errorResponse("NOT_FOUND", "Transfer tidak ditemukan.");
          }
          return found;
        },
        { params: transferParams },
      )
      .delete(
        "/transfers/:id",
        async ({ params, set }) => {
          const deleted = await deleteTransfer(params.id);
          if (!deleted) {
            set.status = 404;
            return errorResponse("NOT_FOUND", "Transfer tidak ditemukan.");
          }
          return { ok: true as const };
        },
        { params: transferParams },
      )
  );
}
