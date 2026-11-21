// Server-only: database health check. Do not import from client components.
import { prisma } from "@/lib/prisma";

export type DatabaseHealthResult = { ok: true; latencyMs: number } | { ok: false };

const HEALTH_CHECK_TIMEOUT_MS = 5000;

export async function checkDatabaseHealth(): Promise<DatabaseHealthResult> {
  const start = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("database health check timed out")),
        HEALTH_CHECK_TIMEOUT_MS,
      );
    });

    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);

    const latencyMs = performance.now() - start;
    return { ok: true, latencyMs };
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : "UnknownError";
    const code =
      typeof err === "object" && err !== null && "code" in err && typeof err.code === "string"
        ? err.code
        : undefined;
    console.error("[health] database check failed", { name, code });
    return { ok: false };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
