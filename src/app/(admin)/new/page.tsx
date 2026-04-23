import { AdminShell } from "@/components/admin/admin-shell";
import { listTemplateFiles } from "@/lib/templates";

import { NewRequestForm } from "./new-request-form";

/**
 * O-03 新規URL発行画面
 *
 * - templates/ 内の docx を列挙してプルダウンに渡す(Server)
 * - 既定の有効期限は本日+14日
 * - フォーム送信は Server Action(actions.ts)
 */

export const dynamic = "force-dynamic";

function defaultExpiresOn(): string {
  // JST 基準の「+14日後の日付(YYYY-MM-DD)」を返す
  const jstOffsetMs = 9 * 60 * 60 * 1000;
  const nowJst = new Date(Date.now() + jstOffsetMs);
  nowJst.setUTCDate(nowJst.getUTCDate() + 14);
  const y = nowJst.getUTCFullYear();
  const m = String(nowJst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(nowJst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function AdminNewRequestPage() {
  const templates = listTemplateFiles();

  return (
    <AdminShell>
      <div className="mx-auto max-w-2xl p-6 md:p-8">
        <h1 className="text-2xl font-bold">新規URL発行</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          顧客(事業主)に送る入力フォームのURLを発行します。会社情報と
          ひな形を指定し、メール等でURLを共有してください。
        </p>

        <div className="mt-6 rounded-lg border bg-card p-5 md:p-6">
          <NewRequestForm
            templates={templates}
            defaultExpiresOn={defaultExpiresOn()}
          />
        </div>
      </div>
    </AdminShell>
  );
}
