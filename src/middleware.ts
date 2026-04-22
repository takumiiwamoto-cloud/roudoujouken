import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  /**
   * 静的ファイル・画像最適化等を除いた全パスでセッション更新を実行。
   * 顧客側のトークン認証ページもここを通るが、Supabase Auth セッションを
   * 持たない場合は更新が無作用なので問題ない。
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
