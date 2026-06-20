import { NextRequest, NextResponse } from "next/server";
import { generateScenario } from "@/lib/scenario";
import { isConfigured } from "@/lib/runpod";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { idea, duration = 30 } = await req.json();
    if (!idea || typeof idea !== "string" || idea.length > 4000) {
      return NextResponse.json({ error: "idea обязательна (строка до 4000 символов)" }, { status: 400 });
    }
    if (!isConfigured("script")) {
      return NextResponse.json(
        { error: "LLM-эндпоинт 'script' не настроен (RUNPOD_SCRIPT_ENDPOINT_ID)." },
        { status: 503 }
      );
    }
    const scenario = await generateScenario(String(idea), Number(duration));
    return NextResponse.json(scenario);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "script failed" }, { status: 500 });
  }
}
