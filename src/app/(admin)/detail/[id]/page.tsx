import { notFound } from "next/navigation";
import Link from "next/link";

import { AdminShell } from "@/components/admin/admin-shell";
import { OfficeInputForm } from "@/components/admin/OfficeInputForm";
import { CustomerForm } from "@/app/(public)/form/[token]/customer-form";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  STATUS_BADGE_CLASS,
  STATUS_LABELS,
} from "@/lib/contract-request-labels";
import { createClient } from "@/lib/supabase/server";
import type { ClientFormValues } from "@/lib/validations/client-form";
import {
  emptyOfficeInput,
  type OfficeInputValues,
} from "@/lib/validations/office-input";
import type { ContractRequestRow } from "@/lib/supabase/types";

/**
 * O-04 依頼詳細(事務所の主作業画面)
 *
 * プロンプト4-C:
 *   - 上部: ステータス・会社情報・従業員氏名サマリ
 *   - タブ1: 顧客入力内容(CustomerForm を admin-edit モードで再利用し編集可能)
 *   - タブ2: 事務所側追加入力(OfficeInputForm)
 *   - 下部: OfficeInputForm 内に 保存 / ステータス変更 / docx 生成
 */

export const dynamic = "force-dynamic";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function toClientFormValues(raw: unknown): ClientFormValues | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  // 型アサーション: /api/submit で zod validate 済みの値が入っている前提。
  return raw as ClientFormValues;
}

function toOfficeInputValues(raw: unknown): OfficeInputValues {
  const base = emptyOfficeInput();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  return { ...base, ...(raw as Partial<OfficeInputValues>) };
}

export default async function AdminRequestDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("contract_requests")
    .select("*")
    .eq("id", params.id)
    .maybeSingle<ContractRequestRow>();

  if (error) {
    console.error("[detail/page] fetch error", error);
  }
  if (!data) {
    notFound();
  }

  const client = toClientFormValues(data.client_input);
  const office = toOfficeInputValues(data.office_input);
  const employeeName = client
    ? [client.last_name, client.first_name].filter((s) => !!s?.trim()).join("　")
    : "";

  return (
    <AdminShell>
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <div className="mb-4">
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← 依頼一覧に戻る
          </Link>
        </div>

        {/* 上部サマリ */}
        <header className="rounded-lg border bg-card p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold md:text-2xl">
                  {data.company_name}
                </h1>
                <span
                  className={[
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                    STATUS_BADGE_CLASS[data.status],
                  ].join(" ")}
                >
                  {STATUS_LABELS[data.status]}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                代表者: {data.representative_name} / 所在地:{" "}
                {data.company_address}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                ひな形: {data.template_name} / URL有効期限:{" "}
                {formatDate(data.expires_at)}
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>
                従業員氏名:{" "}
                <span className="text-sm font-medium text-foreground">
                  {employeeName || "(顧客入力待ち)"}
                </span>
              </p>
              <p className="mt-1">作成: {formatDate(data.created_at)}</p>
              <p>更新: {formatDate(data.updated_at)}</p>
              {data.submitted_at && (
                <p>顧客入力完了: {formatDate(data.submitted_at)}</p>
              )}
              {data.delivered_at && (
                <p>納品: {formatDate(data.delivered_at)}</p>
              )}
            </div>
          </div>
        </header>

        {/* タブ */}
        <div className="mt-4">
          <Tabs defaultValue={client ? "office" : "client"}>
            <TabsList>
              <TabsTrigger value="client">顧客入力内容</TabsTrigger>
              <TabsTrigger value="office">事務所側追加入力</TabsTrigger>
            </TabsList>
            {/* 両タブを常にマウント(forceMount)することで、
                タブ切替で OfficeInputForm の入力 state がリセットされないようにする。
                非アクティブタブは Radix が data-state="inactive" を付与するので、
                data-[state=inactive]:hidden で非表示にする。 */}
            <TabsContent
              value="client"
              className="mt-4 data-[state=inactive]:hidden"
              forceMount
            >
              {client ? (
                <div className="rounded-lg border bg-card p-4 md:p-5">
                  <p className="mb-3 text-xs text-muted-foreground">
                    顧客入力内容の直接編集モード。バリデーションエラーは、該当項目を修正して「保存」してください。保存後、事務所側追加入力タブで docx 生成に進めます。
                  </p>
                  <CustomerForm
                    request={{
                      id: data.id,
                      access_token: data.access_token,
                      company_name: data.company_name,
                      company_address: data.company_address,
                      representative_name: data.representative_name,
                      template_name: data.template_name,
                    }}
                    mode="admin-edit"
                    initialValues={client}
                  />
                </div>
              ) : (
                <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                  顧客はまだフォームを送信していません。送信後に内容の確認・編集ができます。
                </div>
              )}
            </TabsContent>
            <TabsContent
              value="office"
              className="mt-4 data-[state=inactive]:hidden"
              forceMount
            >
              <OfficeInputForm
                requestId={data.id}
                status={data.status}
                initialValues={office}
                client={client}
                defaultConsultationContact={data.representative_name}
                companyAddress={data.company_address}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AdminShell>
  );
}
