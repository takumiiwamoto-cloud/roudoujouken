import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { clientFormSchema } from "@/lib/validations/client-form";
import { notifyOfficeOfSubmission } from "@/lib/email/notify-office";

/**
 * POST /api/submit
 *
 * 顧客フォーム(C-01)からの最終送信を受けるエンドポイント。
 *
 * 処理:
 *   1. body の token/formData を受信
 *   2. token で contract_requests を取得、期限・ステータス確認
 *   3. サーバー側で zod により formData を再バリデーション
 *   4. client_input(jsonb)に formData を保存、status='submitted'、submitted_at=now()
 *   5. Resend で事務所へ通知メール送信(失敗しても送信自体は成功扱い)
 *   6. redirectTo(/complete)を返却
 *
 * 再送信防止: status !== 'pending' の場合は 409 を返す。
 */

export const dynamic = "force-dynamic";

const submitBodySchema = z.object({
  token: z.string().min(1),
  formData: z.unknown(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const parsed = submitBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400 },
    );
  }
  const { token, formData } = parsed.data;

  const supabase = createAdminClient();

  // 1. トークン取得
  const { data: request, error: fetchError } = await supabase
    .from("contract_requests")
    .select(
      "id, access_token, status, expires_at, company_name, template_name",
    )
    .eq("access_token", token)
    .maybeSingle();

  if (fetchError) {
    console.error("[api/submit] fetch failed", fetchError);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 },
    );
  }
  if (!request) {
    return NextResponse.json(
      { ok: false, error: "token_not_found" },
      { status: 404 },
    );
  }

  // 2. 期限・ステータス確認
  if (new Date(request.expires_at) < new Date()) {
    return NextResponse.json(
      { ok: false, error: "token_expired" },
      { status: 410 },
    );
  }
  if (request.status !== "pending") {
    return NextResponse.json(
      { ok: false, error: "already_submitted" },
      { status: 409 },
    );
  }

  // 3. サーバー側 zod 再バリデーション
  const validated = clientFormSchema.safeParse(formData);
  if (!validated.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "validation_failed",
        issues: validated.error.issues,
      },
      { status: 422 },
    );
  }
  const values = validated.data;

  // 4. DB 保存 & status 更新
  //    楽観的な二重送信防止: status='pending' の行に限って UPDATE する
  const { data: updated, error: updateError } = await supabase
    .from("contract_requests")
    .update({
      client_input: values,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", request.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("[api/submit] update failed", updateError);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 },
    );
  }
  if (!updated) {
    // 同時送信で先に submitted 化された等のケース
    return NextResponse.json(
      { ok: false, error: "already_submitted" },
      { status: 409 },
    );
  }

  // 5. 事務所通知メール(失敗しても処理継続)
  const mail = await notifyOfficeOfSubmission({
    requestId: request.id,
    companyName: request.company_name,
    employeeFullName: `${values.last_name} ${values.first_name}`,
    employmentType: values.employment_type,
    templateName: request.template_name,
  });

  return NextResponse.json({
    ok: true,
    redirectTo: "/complete",
    notified: mail.sent,
  });
}
