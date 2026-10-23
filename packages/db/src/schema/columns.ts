import { text, timestamp } from "drizzle-orm/pg-core";
import { newId } from "../ids";

export const id = (prefix: string) =>
  text("id")
    .primaryKey()
    .$defaultFn(() => newId(prefix));

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
