import { AdminShell } from "@/components/admin/admin-shell";

/**
 * O-04 依頼詳細画面(事務所向け・主作業画面)
 * プロンプト4-C で中身実装予定。現時点では AdminShell 内にプレースホルダ表示。
 */
export default function AdminRequestDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <AdminShell>
      <div className="mx-auto max-w-5xl p-8">
        <h1 className="text-2xl font-bold">依頼詳細</h1>
        <p className="mt-4 text-muted-foreground">
          工事中: 依頼ID{" "}
          <code className="rounded bg-muted px-1">{params.id}</code>{" "}
          の詳細画面(タブ構成 + docx生成)をプロンプト4-Cで実装します。
        </p>
      </div>
    </AdminShell>
  );
}
