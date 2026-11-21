import { NextResponse } from "next/server";

export function GET(): NextResponse {
  return NextResponse.json(
    {
      success: true,
      message: "samonaflow API is healthy",
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
