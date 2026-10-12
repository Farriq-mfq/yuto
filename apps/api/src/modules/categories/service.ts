import { db } from "../../db/client";
import { categories } from "../../db/schema";

export async function listCategories() {
  return db.select().from(categories);
}
