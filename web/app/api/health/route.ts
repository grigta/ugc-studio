import { NextResponse } from "next/server";
import { getHealth, isConfigured, EndpointKey } from "@/lib/runpod";

export const runtime = "nodejs";

const KEYS: EndpointKey[] = ["image", "video", "voice"];

export async function GET() {
  const out: Record<string, any> = {};
  for (const ep of KEYS) {
    if (!isConfigured(ep)) {
      out[ep] = { configured: false };
      continue;
    }
    try {
      const h = await getHealth(ep);
      out[ep] = { configured: true, ...h };
    } catch (e: any) {
      out[ep] = { configured: true, error: e.message };
    }
  }
  return NextResponse.json(out);
}
