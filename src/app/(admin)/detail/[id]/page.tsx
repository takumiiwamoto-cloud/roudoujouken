/**
 * O-04 依頼詳細画面(事務所向け・主作業画面)
 * Day 9-10(プロンプト4-C)で実装予定。
 * - タブ1: 顧客入力内容(読み取り専用)
 * - タブ2: 事務所側追加入力(Sheet03 の29項目)
 * - docx生成ボタン
 */
export default function AdminRequestDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-bold">依頼詳細(O-04)</h1>
      <p className="mt-4 text-muted-foreground">
        工事中: 依頼ID <code className="rounded bg-muted px-1">{params.id}</code> の詳細画面(タブ構成 + docx生成)を Day 9-10 で実装します。
      </p>
    </main>
  );
}
