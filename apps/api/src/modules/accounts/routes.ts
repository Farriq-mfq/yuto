import { Elysia, t } from "elysia";
import { errorResponse } from "../../lib/errors";
import {
  createAccount,
  deleteAccount,
  getAccountById,
  getAccountsSummary,
  listAccounts,
  updateAccount,
} from "./service";

const accountType = t.Union([
  t.Literal("bank"),
  t.Literal("ewallet"),
  t.Literal("cash"),
]);

const accountParams = t.Object({ id: t.String({ format: "uuid" }) });

const createAccountBody = t.Object({
  name: t.String({ minLength: 1 }),
  institution: t.String({ minLength: 1 }),
  type: accountType,
  category: t.String({ minLength: 1 }),
  initialBalance: t.Optional(t.Integer({ minimum: 0 })),
  showCategory: t.Optional(t.Boolean()),
});

const updateAccountBody = t.Partial(createAccountBody);

export function accountRoutes() {
  return (
    new Elysia()
      // Static path first so "summary" never matches ":id".
      .get("/accounts/summary", async () => getAccountsSummary())
      .get("/accounts", async () => listAccounts())
      .post(
        "/accounts",
        async ({ body, set }) => {
          const account = await createAccount({
            name: body.name,
            institution: body.institution,
            type: body.type,
            category: body.category,
            initialBalance: body.initialBalance ?? 0,
            showCategory: body.showCategory ?? true,
          });
          set.status = 201;
          return account;
        },
        { body: createAccountBody },
      )
      .get(
        "/accounts/:id",
        async ({ params, set }) => {
          const account = await getAccountById(params.id);
          if (!account) {
            set.status = 404;
            return errorResponse("NOT_FOUND", "Akun tidak ditemukan.");
          }
          return account;
        },
        { params: accountParams },
      )
      .patch(
        "/accounts/:id",
        async ({ params, body, set }) => {
          const account = await updateAccount(params.id, body);
          if (!account) {
            set.status = 404;
            return errorResponse("NOT_FOUND", "Akun tidak ditemukan.");
          }
          return account;
        },
        { params: accountParams, body: updateAccountBody },
      )
      .delete(
        "/accounts/:id",
        async ({ params, set }) => {
          const result = await deleteAccount(params.id);
          if (result === "not-found") {
            set.status = 404;
            return errorResponse("NOT_FOUND", "Akun tidak ditemukan.");
          }
          if (result === "conflict") {
            set.status = 409;
            return errorResponse(
              "CONFLICT",
              "Akun tidak dapat dihapus karena masih memiliki transaksi atau transfer.",
            );
          }
          return { ok: true as const };
        },
        { params: accountParams },
      )
  );
}
