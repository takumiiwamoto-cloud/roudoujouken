import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * 事務所側認証ヘルパ(Server Component / Route Handler 用)
 *
 * 方針:
 *   - セルフ登録不可。ユーザーは Supabase Dashboard から手動登録する。
 *   - /dashboard, /new, /detail/* は未ログインでアクセス不可(middleware で制御)。
 *   - ここで提供するのは getUser / requireUser の薄いラッパ。
 */

export async function getCurrentUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * 管理画面のサーバー側でユーザー必須の箇所に使う。
 * middleware で弾いているので通常ここに未ログインで到達することはないが、
 * 多層防御として null の場合は例外で早期失敗させる。
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("unauthorized: admin user required");
  }
  return user;
}
