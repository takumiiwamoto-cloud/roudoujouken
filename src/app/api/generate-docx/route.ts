import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/supabase/auth";
import { generateDocxForRequest } from "@/lib/docx/generator";

/**
 * POST /api/generate-docx
 *   body: { request_id: string (uuid) }
 *
 *   成功時: { url, path, filename }
 *   失敗時: { code, message }(400 系 or 500)
 *
 *   署名URLは1時間有効・Content-Disposition で自動ダウンロード。
 */

export const runtime = "nodejs";

const bodySchema = z.object({
  request_id: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json(
      { code: "unauthorized", message: "認証が必要です。" },
      { status: 401 },
    );
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    const json = await req.json();
    const r = bodySchema.safeParse(json);
    if (!r.success) {
      return NextResponse.json(
        { code: "invalid_request", message: "不正なリクエストです。" },
        { status: 400 },
      );
    }
    parsed = r.data;
  } catch {
    return NextResponse.json(
      { code: "invalid_json", message: "リクエスト本文を解釈できません。" },
      { status: 400 },
    );
  }

  const result = await generateDocxForRequest(parsed.request_id);

  if (!result.ok) {
    const err = result.error;
    switch (err.kind) {
      case "not_found":
        return NextResponse.json(
          { code: err.kind, message: "依頼が見つかりません。" },
          { status: 404 },
        );
      case "client_input_missing":
        return NextResponse.json(
          {
            code: err.kind,
            message: "顧客入力が未完了のため生成できません。",
          },
          { status: 400 },
        );
      case "template_missing":
        return NextResponse.json(
          {
            code: err.kind,
            message: `ひな形ファイル '${err.fileName}' を templates/ に配置してください。`,
          },
          { status: 500 },
        );
      case "validation_failed":
        return NextResponse.json(
          {
            code: err.kind,
            message:
              "必須項目が不足しています: " +
              err.titles.slice(0, 3).join(" / "),
          },
          { status: 400 },
        );
      case "render_failed":
        return NextResponse.json(
          {
            code: err.kind,
            message: `docx への差し込みに失敗しました: ${err.message}`,
          },
          { status: 500 },
        );
      case "storage_failed":
        return NextResponse.json(
          { code: err.kind, message: err.message },
          { status: 500 },
        );
      default:
        return NextResponse.json(
          { code: "unknown", message: "予期しないエラーが発生しました。" },
          { status: 500 },
        );
    }
  }

  revalidatePath(`/detail/${parsed.request_id}`);

  return NextResponse.json({
    url: result.data.url,
    path: result.data.path,
    filename: result.data.downloadFileName,
  });
}
