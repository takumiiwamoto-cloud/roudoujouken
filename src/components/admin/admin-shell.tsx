import Link from "next/link";

import { requireUser } from "@/lib/supabase/auth";
import { LogoutButton } from "@/components/admin/logout-button";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";

/**
 * 事務所側画面のレイアウトシェル(サイドバー + メイン領域)。
 *
 * - サーバーコンポーネント。先頭で requireUser を呼ぶことで多層防御とする
 *   (middleware でも未ログインは弾いているが、万一を考慮)
 * - サイドバー: 依頼一覧 / 新規作成 / (下部)ログインユーザー + ログアウト
 * - md 未満ではサイドバー非表示、ハンバーガー → ドロワー(AdminMobileNav)
 */

const NAV_ITEMS = [
  { href: "/dashboard", label: "依頼一覧" },
  { href: "/new", label: "新規作成" },
] as const;

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const userEmail = user.email ?? "";

  return (
    <div className="flex min-h-screen flex-col bg-muted/30 md:flex-row">
      <AdminMobileNav navItems={NAV_ITEMS} userEmail={userEmail} />

      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
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
              title={userEmail}
            >
              {userEmail || "(メール未設定)"}
            </p>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-x-auto">{children}</main>
    </div>
  );
}
