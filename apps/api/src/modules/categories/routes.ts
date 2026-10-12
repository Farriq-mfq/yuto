import { Elysia } from "elysia";
import { listCategories } from "./service";

export function categoryRoutes() {
  return new Elysia().get("/categories", async () => listCategories());
}
