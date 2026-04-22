import { NextResponse } from "next/server";

/**
 * 顧客送信API(POST /api/submit)
 * Day 5-7(プロンプト3-C)で実装予定。
 * - body: { token, formData }
 * - トークン検証 → サーバー側 zod 再バリデーション → client_input に jsonb 保存
 *   → status を 'submitted' に更新 → Resend で事務所通知メール送信。
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, message: "工事中: Day 5-7(プロンプト3-C)で実装します。" },
    { status: 501 },
  );
}
