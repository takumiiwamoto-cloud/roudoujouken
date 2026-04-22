import { NextResponse } from "next/server";

/**
 * docx生成API(POST /api/generate-docx)
 * Day 11-12(プロンプト5)で実装予定。
 * - body: { request_id }
 * - contract_requests から client_input/office_input/会社情報を取得
 *   → templates/ から該当ひな形を読み込み
 *   → Sheet06 のタグマッピングで docxtemplater 差し込み
 *   → Supabase Storage に保存 → ダウンロードURLを返却。
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, message: "工事中: Day 11-12(プロンプト5)で実装します。" },
    { status: 501 },
  );
}
