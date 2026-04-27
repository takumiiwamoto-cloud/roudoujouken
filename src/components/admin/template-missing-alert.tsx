/**
 * ひな形ファイル不在を事務所スタッフに伝える共通アラート。
 *
 * O-03(新規URL発行)と O-04(docx 生成失敗時)の両方で同一の見た目を提供する。
 *
 * - title: 「URLを発行できません」「docxを生成できません」など、文脈に応じた失敗の見出し
 * - fileName: 特定のファイル名がわかる場合のみ表示(generate-docx の template_missing で渡す)
 */
export function TemplateMissingAlert({
  title,
  fileName,
}: {
  title: string;
  fileName?: string;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md border-2 border-destructive/60 bg-destructive/10 p-4"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
        aria-hidden="true"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <div className="text-sm text-destructive">
        <p className="font-semibold">ひな形ファイルが見つかりません — {title}</p>
        <p className="mt-1 text-xs leading-relaxed">
          サーバー上の{" "}
          <code className="rounded bg-destructive/20 px-1 py-0.5 font-mono">
            templates/
          </code>{" "}
          フォルダに労働条件通知書のひな形(.docx)が配置されている必要があります。
          {fileName ? (
            <>
              {" "}この依頼で必要なファイル:{" "}
              <code className="rounded bg-destructive/20 px-1 py-0.5 font-mono">
                {fileName}
              </code>
            </>
          ) : (
            <> 想定されるファイル:</>
          )}
        </p>
        {!fileName && (
          <ul className="mt-1 list-disc pl-5 text-xs leading-relaxed">
            <li>労働条件通知書_ひな形_正社員.docx</li>
            <li>労働条件通知書_ひな形_契約社員.docx</li>
            <li>労働条件通知書_ひな形_パート無期.docx</li>
            <li>労働条件通知書_ひな形_パート有期.docx</li>
          </ul>
        )}
        <p className="mt-2 text-xs leading-relaxed">
          配置後、ページを再読み込みしてください。問題が解決しない場合はシステム管理者へお問い合わせください。
        </p>
      </div>
    </div>
  );
}
