import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/minimum-wage?prefecture=東京
 *
 * 顧客フォーム(C-01)からの問い合わせ用。RLS で anon 読み取りも可にしているが、
 * 本 API は `company_address` を都道府県に正規化してから叩く前提なので、
 * サーバーサイドの service_role で統一的に返す。
 *
 * レスポンス:
 *   200 { prefecture, hourly_wage, effective_date }
 *   404 { error: "not_found" }         (未登録の都道府県)
 *   400 { error: "missing_prefecture" }(クエリ無し)
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const prefecture = searchParams.get("prefecture")?.trim();

  if (!prefecture) {
    return NextResponse.json(
      { error: "missing_prefecture" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("minimum_wage_master")
    .select("prefecture, hourly_wage, effective_date")
    .eq("prefecture", prefecture)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
