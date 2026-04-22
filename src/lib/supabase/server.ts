import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server Components / Route Handlers / Server Actions 用の Supabase クライアント。
 * Cookie からセッションを読み取り、必要に応じて更新する。
 * 匿名キー(anon)を使うので、RLS でアクセス制御すること。
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components から呼び出された場合 set は失敗するが、
            // middleware でセッション更新していれば問題ない。
          }
        },
      },
    },
  );
}
