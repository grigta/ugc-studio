import { NextRequest, NextResponse } from "next/server";
import { getStatus, EndpointKey } from "@/lib/runpod";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint") as EndpointKey | null;
  const jobId = searchParams.get("jobId");
  if (!endpoint || !jobId) {
    return NextResponse.json({ error: "endpoint и jobId обязательны" }, { status: 400 });
  }
  try {
    const res = await getStatus(endpoint, jobId);
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "status failed" }, { status: 500 });
  }
}
