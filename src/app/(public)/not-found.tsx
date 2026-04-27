/**
 * 顧客側ルートグループの 404 ページ。
 *
 * トークン無効・期限切れは顧客フォーム側で個別に検出するため、ここに到達するのは
 * URL 直打ち等のレアケース。事務所への連絡を促す文言にする。
 */

export default function PublicNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <h1 className="text-xl font-semibold">ページが見つかりません</h1>
      <p className="text-sm text-muted-foreground">
        お探しのページは存在しないか、URL が誤っている可能性があります。
        <br />
        恐れ入りますが、ご依頼元の事務所より共有された URL を再度ご確認ください。
      </p>
    </div>
  );
}
