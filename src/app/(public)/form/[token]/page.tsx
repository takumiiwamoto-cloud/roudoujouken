/**
 * C-01 入力フォーム(顧客向け・トークン認証)
 * Day 5-7 で実装予定。設計書 Sheet02(顧客入力45項目)/ Sheet04(雇用形態別表示制御)に基づく。
 */
export default function CustomerFormPage({
  params,
}: {
  params: { token: string };
}) {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">入力フォーム(C-01)</h1>
      <p className="mt-4 text-muted-foreground">
        工事中: トークン <code className="rounded bg-muted px-1">{params.token}</code> 用の顧客入力フォームを Day 5-7 で実装します。
      </p>
    </main>
  );
}
