"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BusyOverlay } from "@/components/ui/busy-overlay";
import { TemplateMissingAlert } from "@/components/admin/template-missing-alert";

import type { ClientFormValues } from "@/lib/validations/client-form";
import {
  emptyOfficeInput,
  type OfficeInputValues,
} from "@/lib/validations/office-input";
import {
  validateOfficeInput,
  type OfficeValidationIssue,
} from "@/lib/validations/office-side";
import {
  changeStatusAction,
  saveOfficeInputAction,
} from "@/app/(admin)/detail/[id]/actions";
import type { ContractRequestStatus } from "@/lib/supabase/types";
import { STATUS_LABELS } from "@/lib/contract-request-labels";

/**
 * 事務所側追加入力フォーム(Sheet03 No.5〜26 のうち入力可能項目)。
 *
 * - 保存方式: 明示保存(「保存」ボタン)。未保存状態で離脱時は beforeunload で警告。
 * - Sheet05 No.12〜18 のバリデーションを watch 値からリアルタイム計算。
 * - docx 生成は /api/generate-docx に POST(現状は 501 を返すスタブ、プロンプト5で実装)。
 * - ステータス変更は `reviewed` / `delivered` のみ(画面からの遷移)。
 */

type Props = {
  requestId: string;
  status: ContractRequestStatus;
  initialValues: OfficeInputValues;
  client: ClientFormValues | null;
  /**
   * 相談窓口 (consultation_contact) のデフォルト値。
   * 未入力の依頼に対して初期表示として使用(会社代表者名を想定)。
   */
  defaultConsultationContact?: string;
  /** contract_requests.company_address(妥当性警告用) */
  companyAddress?: string;
};

function isDeepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function numberOrEmpty(v: string): number | "" {
  if (v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? n : "";
}

export function OfficeInputForm({
  requestId,
  status,
  initialValues,
  client,
  defaultConsultationContact,
  companyAddress,
}: Props) {
  // 既存の office_input に値が無い場合のみ、会社代表者名を相談窓口のデフォルトとして充填。
  // saved にも同じ値を入れて、ロード直後は dirty=false として扱う(未編集なら保存不要)。
  // また、顧客側で has_fixed_overtime が確定している場合は office.fixed_overtime も
  // それに合わせて同期する(検証/マッピングと整合させる)。
  const merged = useMemo<OfficeInputValues>(() => {
    const base = { ...emptyOfficeInput(), ...initialValues };
    if (!base.consultation_contact && defaultConsultationContact) {
      base.consultation_contact = defaultConsultationContact;
    }
    if (client?.has_fixed_overtime === "yes") {
      base.fixed_overtime = "present";
    } else if (client?.has_fixed_overtime === "no") {
      base.fixed_overtime = "none";
    }
    return base;
  }, [initialValues, defaultConsultationContact, client?.has_fixed_overtime]);

  const [values, setValues] = useState<OfficeInputValues>(() => merged);
  const [saved, setSaved] = useState<OfficeInputValues>(() => merged);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savePending, startSave] = useTransition();
  const [statusPending, startStatusChange] = useTransition();
  const [docxPending, startDocx] = useTransition();
  const [docxMessage, setDocxMessage] = useState<string | null>(null);
  const [docxTemplateMissing, setDocxTemplateMissing] = useState<
    string | null
  >(null);
  const [pendingDirtyAction, setPendingDirtyAction] = useState<
    | { kind: "status"; status: "reviewed" | "delivered" }
    | { kind: "docx" }
    | null
  >(null);

  const dirty = !isDeepEqual(values, saved);

  // 未保存変更の離脱警告
  useEffect(() => {
    if (!dirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const validation = useMemo(
    () => validateOfficeInput(client, values, { company_address: companyAddress }),
    [client, values, companyAddress],
  );

  function update<K extends keyof OfficeInputValues>(
    key: K,
    next: OfficeInputValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: next }));
  }

  function handleSave() {
    setSubmitError(null);
    startSave(async () => {
      const r = await saveOfficeInputAction({ id: requestId, values });
      if (!r.ok) {
        setSubmitError(r.error);
        return;
      }
      setSaved(values);
    });
  }

  function executeStatusChange(next: "reviewed" | "delivered") {
    setSubmitError(null);
    startStatusChange(async () => {
      const r = await changeStatusAction({ id: requestId, status: next });
      if (!r.ok) {
        setSubmitError(r.error);
      }
    });
  }

  function handleStatusChange(next: "reviewed" | "delivered") {
    if (dirty) {
      setPendingDirtyAction({ kind: "status", status: next });
      return;
    }
    executeStatusChange(next);
  }

  function handleGenerateDocx() {
    setDocxMessage(null);
    if (!validation.canGenerate) return;
    if (dirty) {
      setPendingDirtyAction({ kind: "docx" });
      return;
    }
    executeDocxGeneration();
  }

  function executeDocxGeneration() {
    setDocxTemplateMissing(null);
    startDocx(async () => {
      try {
        const res = await fetch("/api/generate-docx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request_id: requestId }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          if (data?.code === "template_missing") {
            // ファイル名はメッセージ中の '<name>' を抽出して渡す。
            // generator.ts は `ひな形ファイル '労働条件通知書_ひな形_xx.docx' を …` 形式で返す。
            const m = /'([^']+)'/.exec(data.message ?? "");
            setDocxTemplateMissing(m?.[1] ?? "(ファイル名不明)");
            setDocxMessage(null);
            return;
          }
          setDocxMessage(
            data?.message ?? `docx 生成に失敗しました(${res.status})`,
          );
          return;
        }
        if (data?.url) {
          // 署名URLを fetch して blob として取得 → a.download でファイル名付与。
          // 直接 a.href = signedUrl だと Content-Disposition が優先されて
          // URLエンコード済のファイル名が表示されてしまうため、blob 経由にする。
          try {
            const fileRes = await fetch(data.url);
            if (!fileRes.ok) throw new Error(`download failed: ${fileRes.status}`);
            const blob = await fileRes.blob();
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = objectUrl;
            a.download = data.filename ?? "労働条件通知書.docx";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(objectUrl);
            setDocxMessage(
              `docx を生成しました: ${data.filename ?? "労働条件通知書.docx"}`,
            );
          } catch (e) {
            console.error(e);
            setDocxMessage(
              "docx は生成されましたが、ダウンロードに失敗しました。時間を置いて再度お試しください。",
            );
          }
        } else {
          setDocxMessage("docx を生成しました。");
        }
      } catch (e) {
        console.error(e);
        setDocxMessage("通信エラーが発生しました。");
      }
    });
  }

  // 顧客側で「あり/なし」が選択されているか(レガシーデータでは undefined)。
  // 事務所側 UI と office.fixed_overtime / 検証ロジックは下記の優先順で動く:
  //   1. 顧客が yes/no を選んでいる → その通りに固定(事務所側 Select は隠す)
  //   2. 顧客側に値がない(レガシー) → 従来の事務所側 Select で選択
  const clientHasProbation = client?.has_probation; // "yes" | "no" | undefined
  const clientHasFixedOvertime = client?.has_fixed_overtime; // 同上
  const showProbationSection = clientHasProbation !== "no"; // "yes" or undefined → 表示
  const showFixedOvertimeDetails =
    clientHasFixedOvertime === "yes" ||
    (clientHasFixedOvertime === undefined && values.fixed_overtime === "present");
  const isYearlyVariable = values.worktime_type === "yearly_variable";
  const isFlextime = values.worktime_type === "flextime";

  const busy = savePending || statusPending || docxPending;
  const busyLabel = docxPending
    ? "docx を生成しています..."
    : savePending
      ? "保存中..."
      : statusPending
        ? "ステータスを変更しています..."
        : "";

  const errorCount = validation.issues.filter(
    (i) => i.severity === "error",
  ).length;
  const warningCount = validation.issues.filter(
    (i) => i.severity === "warning",
  ).length;

  return (
    <div className="relative space-y-6" aria-busy={busy}>
      {/* sticky 簡易ステータスバー: 上部に常時固定。
          詳細は Section 6 の ValidationSummary に表示される(ジャンプ可能)。
          モバイルでは AdminShell ハンバーガー(h-12)直下に位置するよう top-12。 */}
      <div className="sticky top-12 z-10 -mx-4 border-b bg-background/95 px-4 py-2 backdrop-blur md:-mx-6 md:top-0 md:px-6">
        <button
          type="button"
          onClick={() => {
            const sec = document.getElementById("office-sec6");
            sec?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="flex w-full items-center gap-2 text-left"
        >
          <span className="text-xs text-muted-foreground">
            バリデーション:
          </span>
          {errorCount === 0 && warningCount === 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
              <span
                className="inline-block h-2 w-2 rounded-full bg-emerald-500"
                aria-hidden
              />
              OK(docx 生成可能)
            </span>
          ) : (
            <>
              {errorCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
                  <span
                    className="inline-block h-2 w-2 rounded-full bg-destructive"
                    aria-hidden
                  />
                  エラー {errorCount}件
                </span>
              )}
              {warningCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                  <span
                    className="inline-block h-2 w-2 rounded-full bg-amber-500"
                    aria-hidden
                  />
                  警告 {warningCount}件
                </span>
              )}
            </>
          )}
          <span className="ml-auto text-xs text-muted-foreground hover:underline">
            詳細を見る →
          </span>
        </button>
      </div>

      {/* Section 2. 労働時間制の専門判断 */}
      <FormSection
        title="2. 労働時間制の専門判断"
        id="office-sec2"
        nextSectionId="office-sec3"
      >
        <Field label="労働時間制区分">
          <Select
            value={values.worktime_type ?? ""}
            onValueChange={(v) =>
              update(
                "worktime_type",
                (v || undefined) as OfficeInputValues["worktime_type"],
              )
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">通常</SelectItem>
              <SelectItem value="monthly_variable">1ヶ月単位の変形</SelectItem>
              <SelectItem value="yearly_variable">1年単位の変形</SelectItem>
              <SelectItem value="flextime">フレックスタイム</SelectItem>
              <SelectItem value="outside">事業場外みなし</SelectItem>
              <SelectItem value="discretionary">裁量労働</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {isYearlyVariable && (
          <>
            <Field label="1年変形の対象期間">
              <Input
                value={values.yearly_variable_target_period ?? ""}
                onChange={(e) =>
                  update("yearly_variable_target_period", e.target.value)
                }
                placeholder="例: 4月1日〜翌3月31日"
              />
            </Field>
            <Field label="1年変形の特定期間">
              <Input
                value={values.yearly_variable_special_period ?? ""}
                onChange={(e) =>
                  update("yearly_variable_special_period", e.target.value)
                }
              />
            </Field>
          </>
        )}

        {isFlextime && (
          <>
            <Field label="フレックス清算期間">
              <Input
                value={values.flextime_settlement_period ?? ""}
                onChange={(e) =>
                  update("flextime_settlement_period", e.target.value)
                }
                placeholder="例: 1ヶ月 / 3ヶ月"
              />
            </Field>
            <Field label="フレックスのコアタイム">
              <Input
                value={values.flextime_core_time ?? ""}
                onChange={(e) => update("flextime_core_time", e.target.value)}
                placeholder="例: 11:00〜15:00(コアなしの場合はその旨)"
              />
            </Field>
          </>
        )}

        <Field label="36協定の届出状況">
          <Select
            value={values.agreement_36_status ?? ""}
            onValueChange={(v) =>
              update(
                "agreement_36_status",
                (v || undefined) as OfficeInputValues["agreement_36_status"],
              )
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="filed">届出済</SelectItem>
              <SelectItem value="not_filed">未届出</SelectItem>
              <SelectItem value="not_required">不要</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FormSection>

      {/* Section 3. 管理監督者 */}
      <FormSection
        title="3. 管理監督者・特殊区分"
        id="office-sec3"
        nextSectionId="office-sec4"
      >
        <Field
          label="管理監督者区分"
          hint="日本マクドナルド事件(H20.1.28 東京地判)の4要件で判断"
        >
          <Select
            value={values.manager_supervisor ?? ""}
            onValueChange={(v) =>
              update(
                "manager_supervisor",
                (v || undefined) as OfficeInputValues["manager_supervisor"],
              )
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">該当</SelectItem>
              <SelectItem value="no">非該当</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {values.manager_supervisor === "yes" && (
          <Field label="判断メモ(内部記録)">
            <Textarea
              value={values.manager_supervisor_memo ?? ""}
              onChange={(e) =>
                update("manager_supervisor_memo", e.target.value)
              }
              rows={3}
              placeholder="判断根拠となった事実関係を記録"
            />
          </Field>
        )}

        <Field label="高度プロフェッショナル制度">
          <Select
            value={values.high_professional ?? ""}
            onValueChange={(v) =>
              update(
                "high_professional",
                (v || undefined) as OfficeInputValues["high_professional"],
              )
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">該当(別途同意書必要)</SelectItem>
              <SelectItem value="no">非該当</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FormSection>

      {/* Section 4. 固定残業代 */}
      <FormSection
        title="4. 固定残業代の設計"
        id="office-sec4"
        nextSectionId="office-sec5"
      >
        {clientHasFixedOvertime === "no" ? (
          <p className="rounded-md border border-muted bg-muted/40 p-3 text-sm text-muted-foreground">
            顧客側で「固定残業代なし」が選択されています。詳細入力は不要です。
          </p>
        ) : null}

        {clientHasFixedOvertime === "yes" ? (
          <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            顧客側で「固定残業代あり」が選択されています。下記の詳細を入力してください。
          </p>
        ) : null}

        {clientHasFixedOvertime === undefined && (
          <Field label="固定残業代の設定">
            <Select
              value={values.fixed_overtime ?? ""}
              onValueChange={(v) =>
                update(
                  "fixed_overtime",
                  (v || undefined) as OfficeInputValues["fixed_overtime"],
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">なし</SelectItem>
                <SelectItem value="present">あり</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}

        {showFixedOvertimeDetails && (
          <>
            <Field label="固定残業代の名称">
              <Input
                value={values.fixed_overtime_name ?? ""}
                onChange={(e) =>
                  update("fixed_overtime_name", e.target.value)
                }
                placeholder="例: 固定残業手当 / 営業手当"
              />
            </Field>
            <Field label="固定残業相当時間数(月)">
              <Input
                type="number"
                min={0}
                step={1}
                value={
                  typeof values.fixed_overtime_hours === "number"
                    ? values.fixed_overtime_hours
                    : ""
                }
                onChange={(e) =>
                  update("fixed_overtime_hours", numberOrEmpty(e.target.value))
                }
              />
            </Field>
            <Field label="固定残業相当金額(円)">
              <Input
                type="number"
                min={0}
                step={1}
                value={
                  typeof values.fixed_overtime_amount === "number"
                    ? values.fixed_overtime_amount
                    : ""
                }
                onChange={(e) =>
                  update("fixed_overtime_amount", numberOrEmpty(e.target.value))
                }
              />
            </Field>
            <Field label="超過分の別途支払を明記する">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={Boolean(values.fixed_overtime_excess_notice)}
                  onChange={(e) =>
                    update("fixed_overtime_excess_notice", e.target.checked)
                  }
                />
                超過時は別途支払う旨を通知書に明記する(国際自動車事件 R2.3.30 最判対応)
              </label>
            </Field>

            {validation.fixedOvertimeCheck && (
              <FixedOvertimePanel check={validation.fixedOvertimeCheck} />
            )}
          </>
        )}
      </FormSection>

      {/* Section 5. 試用期間(顧客側で "あり" のときのみ詳細表示) */}
      <FormSection
        title="5. 試用期間の詳細"
        id="office-sec5"
        nextSectionId="office-sec7"
      >
        {clientHasProbation === "no" ? (
          <p className="rounded-md border border-muted bg-muted/40 p-3 text-sm text-muted-foreground">
            顧客側で「試用期間なし」が選択されています。詳細入力は不要です。
          </p>
        ) : null}

        {clientHasProbation === "yes" ? (
          <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            顧客側で「試用期間あり({client?.probation_period ?? "期間未入力"})」が選択されています。下記の詳細を入力してください。
          </p>
        ) : null}

        {showProbationSection && (
          <>
          <Field label="試用期間中の労働条件差異">
            <Select
              value={values.probation_difference ?? ""}
              onValueChange={(v) =>
                update(
                  "probation_difference",
                  (v || undefined) as OfficeInputValues["probation_difference"],
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="same">本採用と同一</SelectItem>
                <SelectItem value="different">差異あり</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {values.probation_difference === "different" && (
            <>
              <Field label="試用期間中の賃金(円)">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={
                    typeof values.probation_wage === "number"
                      ? values.probation_wage
                      : ""
                  }
                  onChange={(e) =>
                    update("probation_wage", numberOrEmpty(e.target.value))
                  }
                />
              </Field>
              <Field label="試用期間中の社会保険">
                <Select
                  value={values.probation_social_insurance ?? ""}
                  onValueChange={(v) =>
                    update(
                      "probation_social_insurance",
                      (v ||
                        undefined) as OfficeInputValues["probation_social_insurance"],
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enrolled">加入(原則初日加入)</SelectItem>
                    <SelectItem value="not_enrolled">加入しない</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="試用期間中の勤務条件">
                <Textarea
                  value={values.probation_work_conditions ?? ""}
                  onChange={(e) =>
                    update("probation_work_conditions", e.target.value)
                  }
                  rows={3}
                />
              </Field>
            </>
          )}
          </>
        )}
      </FormSection>

      {/* Section 7. 契約書記載の補助情報(docx 生成用) */}
      <FormSection
        title="7. 契約書記載の補助情報(docx生成用)"
        id="office-sec7"
        nextSectionId="office-sec6"
      >
        <Field label="時間外労働の有無" hint="Sheet06『overtime_type』タグに反映">
          <Select
            value={values.overtime_type ?? ""}
            onValueChange={(v) =>
              update("overtime_type", (v || undefined) as typeof values.overtime_type)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="-- 選択 --" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">有</SelectItem>
              <SelectItem value="no">無</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="相談窓口(所属部署・担当者・連絡先)"
          hint="2024年4月改正で明示推奨。例: 人事部 労務担当 03-xxxx-xxxx"
        >
          <Textarea
            value={values.consultation_contact ?? ""}
            onChange={(e) => update("consultation_contact", e.target.value)}
            rows={2}
          />
        </Field>

        <Field
          label="就業規則の備付場所"
          hint="例: 本社事務所キャビネット / 社内イントラ"
        >
          <Input
            value={values.work_rules_location ?? ""}
            onChange={(e) => update("work_rules_location", e.target.value)}
          />
        </Field>

        <SelfRetirementNoticePeriodField
          value={values.self_retirement_notice_period ?? ""}
          onChange={(v) => update("self_retirement_notice_period", v)}
        />

        <Field
          label="休暇に関する事項(年休以外)"
          hint="慶弔休暇・特別休暇・産前産後・育休等の規定を要約"
        >
          <Textarea
            value={values.leave_clause ?? ""}
            onChange={(e) => update("leave_clause", e.target.value)}
            rows={3}
          />
        </Field>
      </FormSection>

      {/* Section 6. 最終チェック + 内部メモ */}
      <FormSection title="6. 最終チェック・納品メモ" id="office-sec6">
        <Field
          label="事務所内部メモ / 納品メモ"
          hint="担当者間の申し送り、納品時の備考等"
        >
          <Textarea
            value={values.internal_memo ?? ""}
            onChange={(e) => update("internal_memo", e.target.value)}
            rows={4}
          />
        </Field>

        <ValidationSummary issues={validation.issues} />
      </FormSection>

      {/* 下部アクション */}
      <div className="sticky bottom-0 -mx-4 mt-6 border-t bg-background/95 px-4 py-4 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={handleSave}
            disabled={savePending || !dirty}
          >
            {savePending ? "保存中..." : dirty ? "保存" : "保存済み"}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => handleStatusChange("reviewed")}
            disabled={
              statusPending || status === "reviewed" || status === "delivered"
            }
          >
            確認中にする
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => handleStatusChange("delivered")}
            disabled={
              statusPending ||
              status === "delivered" ||
              !validation.canGenerate
            }
            title={
              !validation.canGenerate
                ? "エラー(生成ブロック)が残っているため納品済にできません"
                : undefined
            }
          >
            納品済にする
          </Button>

          <div className="ml-auto flex items-center gap-3">
            {!validation.canGenerate && (
              <span className="text-xs text-destructive">
                必須項目が不足しているため生成できません
              </span>
            )}
            <Button
              type="button"
              variant="default"
              onClick={handleGenerateDocx}
              disabled={docxPending || !validation.canGenerate}
            >
              {docxPending ? "生成中..." : "docx を生成"}
            </Button>
          </div>
        </div>

        {submitError && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {submitError}
          </p>
        )}
        {docxTemplateMissing && (
          <div className="mt-3">
            <TemplateMissingAlert
              title="docx を生成できません"
              fileName={docxTemplateMissing}
            />
          </div>
        )}
        {docxMessage && (
          <p className="mt-2 text-sm text-muted-foreground">{docxMessage}</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          現在のステータス: {STATUS_LABELS[status]}
          {dirty && <span className="ml-2 text-amber-700">(未保存)</span>}
        </p>
      </div>

      <AlertDialog
        open={pendingDirtyAction !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDirtyAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>未保存の変更があります</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDirtyAction?.kind === "status"
                ? "未保存の入力を破棄してステータスを変更しますか?変更内容は失われます。"
                : "未保存の入力を破棄して docx を生成しますか?保存していない内容は反映されません。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = pendingDirtyAction;
                setPendingDirtyAction(null);
                if (!action) return;
                if (action.kind === "status") {
                  executeStatusChange(action.status);
                } else {
                  executeDocxGeneration();
                }
              }}
            >
              破棄して続行
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BusyOverlay show={busy} label={busyLabel} />
    </div>
  );
}

// -------------------------------------------------------------------------
// サブコンポーネント
// -------------------------------------------------------------------------

function FormSection({
  title,
  id,
  nextSectionId,
  children,
}: {
  title: string;
  id?: string;
  /** 「次のセクションへ」ボタンの飛び先。省略時はボタン非表示。 */
  nextSectionId?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="rounded-lg border border-l-4 border-l-sky-400 bg-card p-4 md:p-5"
    >
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="space-y-4">{children}</div>
      {nextSectionId && (
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const sec = document.getElementById(nextSectionId);
              sec?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            次のセクションへ →
          </Button>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const SELF_RETIREMENT_PRESETS = [
  "退職希望日の14日前",
  "退職希望日の1ヶ月前",
  "退職希望日の2ヶ月前",
] as const;

function SelfRetirementNoticePeriodField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const isPreset = (SELF_RETIREMENT_PRESETS as readonly string[]).includes(
    value,
  );
  // value が非プリセットかつ非空 → 自動的に「その他」モード。
  // value が空 or プリセット → 基本は preset モードだが、
  // ユーザーが明示的に「その他」を選んだ場合は otherSticky で保持する。
  const [otherSticky, setOtherSticky] = useState<boolean>(
    !isPreset && value !== "",
  );
  const mode: "preset" | "other" =
    !isPreset && value !== "" ? "other" : otherSticky ? "other" : "preset";
  const selectValue =
    mode === "other"
      ? "__other__"
      : isPreset
        ? value
        : undefined;

  return (
    <Field
      label="自己都合退職の予告期間"
      hint="民法627条では2週間前の申出が原則。就業規則で別途定めがある場合はそれに従う。"
    >
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === "__other__") {
            setOtherSticky(true);
            // プリセット値が入っていたらクリアして自由記述欄に切り替える
            if (isPreset) onChange("");
          } else {
            setOtherSticky(false);
            onChange(v);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="-- 選択 --" />
        </SelectTrigger>
        <SelectContent>
          {SELF_RETIREMENT_PRESETS.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
          <SelectItem value="__other__">その他(自由記述)</SelectItem>
        </SelectContent>
      </Select>
      {mode === "other" && (
        <Input
          className="mt-2"
          placeholder="例: 退職希望日の30日前"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

function ValidationSummary({
  issues,
}: {
  issues: OfficeValidationIssue[];
}) {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  if (errors.length === 0 && warnings.length === 0) {
    return (
      <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
        バリデーション: エラー・警告はありません。docx 生成可能です。
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {errors.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p className="font-semibold text-destructive">
            エラー({errors.length}件)— docx 生成がブロックされます
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-destructive">
            {errors.map((e, i) => (
              <li key={i}>
                <span className="font-medium">{e.title}</span>
                {e.detail && (
                  <span className="block text-xs opacity-90">{e.detail}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm">
          <p className="font-semibold text-amber-900">
            警告({warnings.length}件)— 内容確認を推奨(ブロックしません)
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="font-medium">{w.title}</span>
                {w.detail && (
                  <span className="block text-xs opacity-90">{w.detail}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FixedOvertimePanel({
  check,
}: {
  check: NonNullable<
    ReturnType<typeof validateOfficeInput>["fixedOvertimeCheck"]
  >;
}) {
  if ("skipped" in check) {
    return (
      <div className="rounded-md border border-muted bg-muted/40 p-3 text-xs text-muted-foreground">
        適法性チェック: スキップ({check.reason})
      </div>
    );
  }
  const bg = check.ok
    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
    : "border-destructive/40 bg-destructive/10 text-destructive";
  return (
    <div className={`rounded-md border p-3 text-xs ${bg}`}>
      <p className="font-semibold">
        適法性チェック: {check.ok ? "OK" : "要見直し"}
      </p>
      <p className="mt-1 opacity-90">
        基礎時給 {check.basicHourlyWage.toLocaleString()} 円 × 1.25 ×{" "}
        {check.hours} 時間 ={" "}
        <b>{check.requiredAmount.toLocaleString()} 円</b> が必要
        <span className="ml-1">
          (現状: {check.actualAmount.toLocaleString()} 円)
        </span>
      </p>
    </div>
  );
}
