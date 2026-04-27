"use client";

/**
 * 事務所側画面のモバイル用ナビゲーション。
 *
 * AdminShell から navItems / userEmail を props で受け取り、ハンバーガー
 * ボタン → 左側スライドインのドロワーを描画する。デスクトップ(md 以上)
 * では非表示。
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/components/admin/logout-button";

type NavItem = { href: string; label: string };

export function AdminMobileNav({
  navItems,
  userEmail,
}: {
  navItems: readonly NavItem[];
  userEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // ルート変更時に自動で閉じる(ナビゲーション後にドロワーが残らないように)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 開いている時は body スクロールをロック
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc で閉じる
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b bg-card px-3 md:hidden">
        <button
          type="button"
          aria-label="メニューを開く"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>
        <p className="text-sm font-semibold">事務所管理画面</p>
        <span className="w-9" aria-hidden="true" />
      </header>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="ナビゲーション"
          className="fixed inset-0 z-40 md:hidden"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[80%] flex-col bg-card shadow-xl">
            <div className="flex items-start justify-between border-b p-4">
              <div>
                <p className="text-xs text-muted-foreground">
                  雇用契約書自動作成ツール
                </p>
                <p className="mt-1 text-sm font-semibold">事務所管理画面</p>
              </div>
              <button
                type="button"
                aria-label="メニューを閉じる"
                onClick={() => setOpen(false)}
                className="-mr-1 inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="6" y1="18" x2="18" y2="6" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-3">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="space-y-2 border-t p-3">
              <div className="px-1">
                <p className="text-[11px] text-muted-foreground">ログイン中</p>
                <p className="truncate text-xs font-medium" title={userEmail}>
                  {userEmail || "(メール未設定)"}
                </p>
              </div>
              <LogoutButton />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
