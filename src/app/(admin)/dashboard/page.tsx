import { AdminShell } from "@/components/admin/admin-shell";

/**
 * O-02 依頼一覧画面(事務所向け)
 * プロンプト4-B で中身実装予定。現時点では AdminShell 内にプレースホルダ表示。
 */
export default function AdminDashboardPage() {
  return (
    <AdminShell>
      <div className="mx-auto max-w-5xl p-8">
        <h1 className="text-2xl font-bold">依頼一覧</h1>
        <p className="mt-4 text-muted-foreground">
          工事中: 依頼一覧(ステータス別フィルタ付き)をプロンプト4-Bで実装します。
        </p>
      </div>
    </AdminShell>
  );
}
