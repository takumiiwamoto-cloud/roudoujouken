import { AdminShell } from "@/components/admin/admin-shell";

/**
 * O-03 依頼新規作成画面(事務所向け)
 * プロンプト4-B で中身実装予定。現時点では AdminShell 内にプレースホルダ表示。
 */
export default function AdminNewRequestPage() {
  return (
    <AdminShell>
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-bold">依頼新規作成</h1>
        <p className="mt-4 text-muted-foreground">
          工事中: 会社情報入力 → URL 発行 → コピー機能をプロンプト4-Bで実装します。
        </p>
      </div>
    </AdminShell>
  );
}
