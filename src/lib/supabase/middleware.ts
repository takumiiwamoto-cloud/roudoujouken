import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * middleware から呼ぶセッション更新 + 事務所側認可ヘルパ。
 *
 * 責務:
 *   1. Supabase セッションの Cookie を最新化(getUser 呼び出し)
 *   2. 事務所側保護パス(/dashboard, /new, /detail/*)は未ログインなら /login へ
 *   3. /login は既にログイン済みなら /dashboard へ(ログイン画面を再訪させない)
 *
 * 顧客側(/form/[token], /complete)は本ツールのトークン認証対象外。
 */

const ADMIN_PROTECTED_PREFIXES = ["/dashboard", "/new", "/detail"];

function isAdminProtectedPath(pathname: string) {
  return ADMIN_PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // 保護パスへの未ログインアクセスは /login へ
  if (!user && isAdminProtectedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // ログイン後に戻せるよう次遷移先を付与(same-origin のみ)
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // ログイン済みで /login に来たら /dashboard へ
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
