/**
 * 通知メールテンプレート共通ユーティリティ。
 *
 * 各テンプレートは text / html の両方を返す純関数として実装する。
 * html 側でユーザー入力を埋め込む箇所は escapeHtml で必ずエスケープすること。
 */

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 共通の HTML レイアウト(プレーンテキスト互換のシンプルな <pre> ベース)。 */
export function htmlLayout(args: {
  heading: string;
  body: string;
  footer?: string;
}): string {
  const footer =
    args.footer ??
    "このメールは雇用契約書自動作成ツールから自動送信されています。";
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(args.heading)}</title>
</head>
<body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans','Yu Gothic UI',sans-serif;color:#111827;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
    <h1 style="margin:0 0 16px;font-size:16px;color:#111827;">${escapeHtml(args.heading)}</h1>
    <div style="font-size:14px;line-height:1.7;">${args.body}</div>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;" />
    <p style="margin:0;font-size:12px;color:#6b7280;">${escapeHtml(footer)}</p>
  </div>
</body>
</html>`;
}
