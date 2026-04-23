import type { ContractRequestStatus } from "@/lib/supabase/types";

/**
 * 事務所側 UI で使う contract_requests のラベル/表示補助。
 *
 * 設計書 Sheet07(ワークフロー): pending → submitted → reviewed → delivered
 *   pending   : URL 発行済・顧客入力待ち
 *   submitted : 顧客入力完了
 *   reviewed  : 事務所確認済(追加入力完了)
 *   delivered : docx 生成・納品済
 */
export const STATUS_LABELS: Record<ContractRequestStatus, string> = {
  pending: "入力待ち",
  submitted: "入力済",
  reviewed: "確認中",
  delivered: "納品済",
};

export const STATUS_TAB_ORDER: ReadonlyArray<
  ContractRequestStatus | "all"
> = ["pending", "submitted", "reviewed", "delivered", "all"];

export const STATUS_TAB_LABELS: Record<ContractRequestStatus | "all", string> =
  {
    ...STATUS_LABELS,
    all: "全件",
  };

export const STATUS_BADGE_CLASS: Record<ContractRequestStatus, string> = {
  pending: "bg-amber-100 text-amber-900 border-amber-300",
  submitted: "bg-sky-100 text-sky-900 border-sky-300",
  reviewed: "bg-violet-100 text-violet-900 border-violet-300",
  delivered: "bg-emerald-100 text-emerald-900 border-emerald-300",
};

export function isContractRequestStatus(
  v: string,
): v is ContractRequestStatus {
  return v === "pending" || v === "submitted" || v === "reviewed" || v === "delivered";
}
