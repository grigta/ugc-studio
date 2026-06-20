import { NextRequest, NextResponse } from "next/server";
import { buildJob } from "@/lib/workflows";
import { runJob, isConfigured } from "@/lib/runpod";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { tool, params = {}, files = [] } = await req.json();
    if (!tool) return NextResponse.json({ error: "tool is required" }, { status: 400 });

    if (Array.isArray(files)) {
      const bytes = files.reduce((n: number, f: any) => n + (f?.dataUrl?.length || 0), 0);
      if (bytes > 12 * 1024 * 1024) {
        return NextResponse.json(
          { error: "Файлы слишком большие (>12 МБ). На Vercel лимит тела запроса ~4.5 МБ — уменьши вход." },
          { status: 413 }
        );
      }
      for (const f of files) {
        if (f?.dataUrl && !/^data:(image|audio|video)\/[a-z0-9.+-]+;base64,/i.test(f.dataUrl)) {
          return NextResponse.json({ error: "Недопустимый формат файла" }, { status: 400 });
        }
      }
    }

    const job = buildJob(tool, params, files);

    if (!isConfigured(job.endpoint)) {
      return NextResponse.json(
        { error: `Эндпоинт '${job.endpoint}' не настроен. Заполни web/.env.local (см. deploy/deploy.mjs).` },
        { status: 503 }
      );
    }

    const res = await runJob(job.endpoint, job.input);
    return NextResponse.json({ jobId: res.id, status: res.status, endpoint: job.endpoint });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "run failed" }, { status: 500 });
  }
}
