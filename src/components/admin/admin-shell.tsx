import Link from "next/link";

import { requireUser } from "@/lib/supabase/auth";
import { LogoutButton } from "@/components/admin/logout-button";

/**
 * 事務所側画面のレイアウトシェル(サイドバー + メイン領域)。
 *
 * - サーバーコンポーネント。先頭で requireUser を呼ぶことで多層防御とする
 *   (middleware でも未ログインは弾いているが、万一を考慮)
 * - サイドバー: 依頼一覧 / 新規作成 / (下部)ログインユーザー + ログアウト
 */

const NAV_ITEMS = [
  { href: "/dashboard", label: "依頼一覧" },
  { href: "/new", label: "新規作成" },
] as const;

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
        <div className="border-b p-4">
          <p className="text-xs text-muted-foreground">雇用契約書自動作成ツール</p>
          <p className="mt-1 text-sm font-semibold">事務所管理画面</p>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t p-3 space-y-2">
          <div className="px-1">
            <p className="text-[11px] text-muted-foreground">ログイン中</p>
            <p
              className="truncate text-xs font-medium"
              title={user.email ?? ""}
            >
              {user.email ?? "(メール未設定)"}
            </p>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto">{children}</main>
    </div>
  );
}
