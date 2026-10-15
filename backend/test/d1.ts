/**
 * Just enough of D1 over Node's built-in SQLite to run the Worker's routes in
 * tests, with the real migrations applied. Covers what the code calls:
 * prepare/bind/first/all/run and batch (as one transaction, like D1).
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type Value = string | number | null;

/** Statements executed, batch members counted one by one, as D1's per-request limit may count them. */
export const queryCount = { value: 0 };

class Statement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    readonly params: Value[] = [],
  ) {}

  bind(...params: unknown[]): Statement {
    return new Statement(this.db, this.sql, params.map((p) => (p === undefined ? null : (p as Value))));
  }

  async first<T>(): Promise<T | null> {
    queryCount.value++;
    return (this.db.prepare(this.sql).get(...this.params) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    queryCount.value++;
    return { results: this.db.prepare(this.sql).all(...this.params) as T[] };
  }

  async run(): Promise<{ results: never[] }> {
    queryCount.value++;
    this.db.prepare(this.sql).run(...this.params);
    return { results: [] };
  }

  /** Synchronous form used inside a batch transaction. */
  execute(): { results: unknown[] } {
    queryCount.value++;
    const stmt = this.db.prepare(this.sql);
    if (/^\s*(SELECT|WITH)/i.test(this.sql)) return { results: stmt.all(...this.params) };
    stmt.run(...this.params);
    return { results: [] };
  }
}

export function createTestD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const dir = join(import.meta.dirname, "..", "migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(join(dir, f), "utf8"));
  }
  const d1 = {
    prepare: (sql: string) => new Statement(db, sql),
    async batch(stmts: Statement[]) {
      db.exec("BEGIN");
      try {
        const out = stmts.map((s) => s.execute());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return d1 as unknown as D1Database;
}
