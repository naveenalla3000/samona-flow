import { connection, NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/server/database/health";

export async function GET(): Promise<NextResponse> {
  await connection();
  const health = await checkDatabaseHealth();

  if (health.ok) {
    return NextResponse.json(
      {
        success: true,
        status: "ok",
        database: "connected",
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      success: false,
      status: "degraded",
      database: "unavailable",
      timestamp: new Date().toISOString(),
    },
    { status: 503 },
  );
}
