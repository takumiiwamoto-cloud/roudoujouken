import { createBrowserClient } from "@supabase/ssr";

/**
 * Client Components 用の Supabase クライアント。
 * ブラウザで実行されるコードからのみ使用すること。
 * 匿名キー(anon)を使うので、RLS でアクセス制御すること。
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
