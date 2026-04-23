/**
 * C-02 送信完了画面(顧客向け)
 *
 * プロンプト3-C:
 *   - 送信完了メッセージ
 *   - 「事務所からの納品をお待ちください」文言
 *   - フォームには戻れないようにする(戻るリンクは置かない)
 *
 * セキュリティ: 本画面はトークンを持たず、誰でも閲覧可能な静的ページ。
 * 個別情報は一切表示しない。
 */

export const dynamic = "force-static";

export default function CustomerCompletePage() {
  return (
    <main className="mx-auto max-w-xl p-6 md:p-10">
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-6 md:p-8">
        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 111.42-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-emerald-900">
          ご入力ありがとうございました
        </h1>
        <p className="mt-3 text-sm md:text-base leading-relaxed text-emerald-900">
          労働条件通知書の作成に必要な情報を受け付けました。
        </p>
        <p className="mt-3 text-sm md:text-base leading-relaxed text-emerald-900">
          このあとは事務所側で内容を確認のうえ、書面を作成いたします。
          <br />
          <b>事務所からの納品までお待ちください。</b>
        </p>
      </div>

      <div className="mt-6 rounded-md border bg-muted/40 p-4 text-xs text-muted-foreground leading-relaxed">
        <p>
          ご入力いただいた内容の修正が必要な場合は、お手数ですが依頼元の事務所までご連絡ください。
        </p>
        <p className="mt-2">
          このページは閉じていただいて問題ありません。入力URLは送信済みのため、同じURLからの再入力はできません。
        </p>
      </div>
    </main>
  );
}
