"use client";

/**
 * 送信・保存・docx 生成などの長時間処理中に画面を被せて操作を抑止するオーバーレイ。
 *
 *   <div className="relative">
 *     ...フォーム本体...
 *     <BusyOverlay show={submitting} label="送信中..." />
 *   </div>
 *
 * 親要素に `relative` を必ず付けること(absolute 位置決めの基準にする)。
 */
export function BusyOverlay({
  show,
  label,
}: {
  show: boolean;
  label: string;
}) {
  if (!show) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-30 flex items-center justify-center rounded-md bg-background/70 backdrop-blur-[1px]"
    >
      <div className="flex flex-col items-center gap-2 rounded-lg border bg-card px-6 py-4 shadow-md">
        <Spinner />
        <p className="text-sm font-medium">{label}</p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-6 w-6 animate-spin text-primary"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}
