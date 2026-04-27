"use client";

/**
 * ルートレイアウト自体が落ちた場合の最終フォールバック。
 *
 * Next.js App Router の規約: global-error.tsx は <html> / <body> を自前で書く必要が
 * ある(ルートレイアウトが描画失敗しているため)。ここにはサードパーティ CSS を
 * 持ち込まず、最小限のインラインスタイルで描画する。
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          padding: 24,
          fontFamily:
            "-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans','Yu Gothic UI',sans-serif",
          color: "#111827",
          background: "#f6f7f9",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            margin: "10vh auto",
            padding: 24,
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 18, margin: "0 0 12px" }}>
            重大なエラーが発生しました
          </h1>
          <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            アプリケーションの初期化に失敗しました。ブラウザを再読み込みしてください。
            問題が解決しない場合は管理者へお問い合わせください。
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              background: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            再読み込み
          </button>
          {error.digest ? (
            <p
              style={{ marginTop: 12, fontSize: 12, color: "#6b7280" }}
            >
              エラーID: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
