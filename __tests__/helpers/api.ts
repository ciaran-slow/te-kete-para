import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { destroyDb, getDb } from "@/lib/db";

/** Fresh shared DB with all migrations applied. Call in beforeAll. Idempotent. */
export async function setupTestDb() {
  const db = getDb();
  await db.migrate.latest();
  return db;
}

/** Call in afterAll. Safe even if the connection was already destroyed. */
export async function teardownTestDb() {
  await destroyDb();
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
type Method = (typeof METHODS)[number];

export type RouteModule = Partial<
  Record<Method, (request: Request) => Response | Promise<Response>>
>;

/**
 * Adapts a route module's Web-API handlers into a Node `RequestListener`, which
 * `supertest(...)` accepts directly — so the handler runs in this process and
 * sees the same in-memory SQLite DB as the test's fixtures (ADR 0003).
 */
export function createRequestListener(routeModule: RouteModule): RequestListener {
  return (req, res) => {
    void handle(routeModule, req, res).catch(() => {
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
  };
}

function isMethod(method: string): method is Method {
  return (METHODS as readonly string[]).includes(method);
}

async function handle(
  routeModule: RouteModule,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const method = (req.method ?? "GET").toUpperCase();
  const handler = isMethod(method) ? routeModule[method] : undefined;

  if (!handler) {
    // Mirrors Next's own behaviour for a verb the route file does not export.
    res.statusCode = 405;
    res.setHeader(
      "Allow",
      METHODS.filter((candidate) => routeModule[candidate]).join(", "),
    );
    res.end();
    return;
  }

  // A relative req.url needs a base to parse; the host is irrelevant to the
  // handler, but path AND query string must survive so handlers can read
  // `new URL(request.url).searchParams`.
  const url = new URL(req.url ?? "/", "http://test.local");

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);
  // fetch's Request constructor throws outright if a GET/HEAD carries a body.
  const hasBody = method !== "GET" && method !== "HEAD" && body.length > 0;

  const response = await handler(
    new Request(url, { method, headers, body: hasBody ? body : undefined }),
  );

  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}
