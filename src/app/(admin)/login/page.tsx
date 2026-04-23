import { Suspense } from "react";

import { LoginForm } from "./login-form";

/**
 * O-01 事務所ログイン画面
 *
 * プロンプト4-A:
 *   - Supabase Auth(メール+パスワード)
 *   - セルフ登録不可。アカウント作成はシステム管理者依頼。
 *   - useSearchParams を含むフォームを Suspense でラップ(Next.js CSR bailout 対策)
 */
export default function AdminLoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center p-6">
      <div className="w-full rounded-lg border bg-card p-6 shadow-sm md:p-8">
        <h1 className="text-xl font-bold md:text-2xl">事務所ログイン</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          社労士事務所向け 雇用契約書自動作成ツール
        </p>

        <Suspense
          fallback={
            <div className="mt-6 h-40 animate-pulse rounded-md bg-muted/50" />
          }
        >
          <LoginForm />
        </Suspense>

        <div className="mt-6 rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          アカウント登録はシステム管理者にご依頼ください。本画面からの自己登録はできません。
        </div>
      </div>
    </main>
  );
}
