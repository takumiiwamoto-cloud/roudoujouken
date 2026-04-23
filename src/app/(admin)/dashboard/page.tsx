import Link from "next/link";

import { AdminShell } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import {
  STATUS_BADGE_CLASS,
  STATUS_LABELS,
  STATUS_TAB_LABELS,
  STATUS_TAB_ORDER,
  isContractRequestStatus,
} from "@/lib/contract-request-labels";
import type { ContractRequestRow } from "@/lib/supabase/types";

import { DashboardSearch } from "./dashboard-search";
import { DeleteButton } from "./delete-button";

/**
 * O-02 依頼一覧画面
 *
 * プロンプト4-B:
 *   - ステータス別タブ: 入力待ち / 入力済 / 確認中 / 納品済 / 全件
 *   - テーブル: 会社名 / 従業員氏名 / ステータス / 作成日 / 更新日 / 詳細
 *   - 会社名フリーテキスト検索(?q=)
 *   - デフォルトソート: 更新日降順
 *
 * データアクセスは authenticated セッション + RLS(authenticated_full_access)。
 * 未ログイン時は middleware で /login に弾かれるため、ここに到達した時点で
 * user は必ず存在する(AdminShell 先頭の requireUser で多層防御)。
 */

export const dynamic = "force-dynamic";

type SearchParams = {
  status?: string;
  q?: string;
};

function pickStatusFilter(raw: string | undefined) {
  if (!raw) return "pending" as const;
  if (raw === "all") return "all" as const;
  if (isContractRequestStatus(raw)) return raw;
  return "pending" as const;
}

function extractEmployeeName(row: ContractRequestRow): string {
  const input = row.client_input;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "-";
  }
  const record = input as Record<string, unknown>;
  const last = typeof record.last_name === "string" ? record.last_name : "";
  const first = typeof record.first_name === "string" ? record.first_name : "";
  const full = `${last} ${first}`.trim();
  return full || "-";
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

function buildTabHref(
  status: (typeof STATUS_TAB_ORDER)[number],
  q: string,
): string {
  const sp = new URLSearchParams();
  if (status !== "pending") sp.set("status", status);
  if (q) sp.set("q", q);
  return sp.toString() ? `/dashboard?${sp.toString()}` : "/dashboard";
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const status = pickStatusFilter(searchParams?.status);
  const q = (searchParams?.q ?? "").trim();

  const supabase = createClient();

  let query = supabase
    .from("contract_requests")
    .select(
      "id, company_name, status, created_at, updated_at, client_input",
    )
    .order("updated_at", { ascending: false })
    .limit(200);

  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (q) {
    // ilike で部分一致・大文字小文字区別なし。% は PG 側でエスケープ不要な
    // 通常の部分一致としてそのまま埋め込む(q はユーザー入力だが
    // supabase-js がパラメータバインディングを行う)。
    query = query.ilike("company_name", `%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[dashboard] fetch error", error);
  }

  const rows = (data ?? []) as ContractRequestRow[];

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">依頼一覧</h1>
          <Button asChild size="sm">
            <Link href="/new">新規URL発行</Link>
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
          <nav
            aria-label="ステータスタブ"
            className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1"
          >
            {STATUS_TAB_ORDER.map((tab) => {
              const active = tab === status;
              return (
                <Link
                  key={tab}
                  href={buildTabHref(tab, q)}
                  scroll={false}
                  className={[
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-background text-foreground shadow"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                  aria-current={active ? "page" : undefined}
                >
                  {STATUS_TAB_LABELS[tab]}
                </Link>
              );
            })}
          </nav>
          <DashboardSearch initialQ={q} />
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">会社名</th>
                <th className="px-3 py-2 font-medium">従業員氏名</th>
                <th className="px-3 py-2 font-medium">ステータス</th>
                <th className="px-3 py-2 font-medium">作成日</th>
                <th className="px-3 py-2 font-medium">更新日</th>
                <th className="px-3 py-2 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-10 text-center text-sm text-muted-foreground"
                  >
                    該当する依頼はありません。
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b last:border-b-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2">{row.company_name}</td>
                  <td className="px-3 py-2">{extractEmployeeName(row)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={[
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                        STATUS_BADGE_CLASS[row.status],
                      ].join(" ")}
                    >
                      {STATUS_LABELS[row.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTime(row.updated_at)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-7 px-3"
                      >
                        <Link href={`/detail/${row.id}`}>詳細</Link>
                      </Button>
                      {row.status === "pending" && (
                        <DeleteButton
                          id={row.id}
                          companyName={row.company_name}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length === 200 && (
          <p className="mt-2 text-xs text-muted-foreground">
            最新 200 件までを表示しています(ページネーションは後続プロンプトで対応)。
          </p>
        )}
      </div>
    </AdminShell>
  );
}
