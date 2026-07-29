import { getDb } from "@/lib/db";

export async function GET(): Promise<Response> {
  try {
    await getDb().raw("SELECT 1");
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
