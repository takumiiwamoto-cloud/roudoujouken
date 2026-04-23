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
}: Props) {
  const [values, setValues] = useState<OfficeInputValues>(
    () => ({ ...emptyOfficeInput(), ...initialValues }),
  );
  const [saved, setSaved] = useState<OfficeInputValues>(
    () => ({ ...emptyOfficeInput(), ...initialValues }),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savePending, startSave] = useTransition();
  const [statusPending, startStatusChange] = useTransition();
  const [docxPending, startDocx] = useTransition();
  const [docxMessage, setDocxMessage] = useState<string | null>(null);

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
    () => validateOfficeInput(client, values),
    [client, values],
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

  function handleStatusChange(next: "reviewed" | "delivered") {
    if (dirty) {
      const ok = window.confirm(
        "未保存の入力があります。先に保存してからステータスを変更してください。\nそのまま続ける場合は OK を押してください(変更は破棄されます)。",
      );
      if (!ok) return;
    }
    setSubmitError(null);
    startStatusChange(async () => {
      const r = await changeStatusAction({ id: requestId, status: next });
      if (!r.ok) {
        setSubmitError(r.error);
      }
    });
  }

  async function handleGenerateDocx() {
    setDocxMessage(null);
    if (!validation.canGenerate) return;
    if (dirty) {
      const ok = window.confirm(
        "未保存の入力があります。先に保存してから docx を生成してください。\n続行しますか?",
      );
      if (!ok) return;
    }
    startDocx(async () => {
      try {
        const res = await fetch("/api/generate-docx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request_id: requestId }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setDocxMessage(
            data?.message ?? `docx 生成に失敗しました(${res.status})`,
          );
          return;
        }
        setDocxMessage("docx を生成しました。");
      } catch (e) {
        console.error(e);
        setDocxMessage("通信エラーが発生しました。");
      }
    });
  }

  const showProbationSection = client?.has_probation === "yes";
  const isFixedOvertime = values.fixed_overtime === "present";
  const isYearlyVariable = values.worktime_type === "yearly_variable";
  const isFlextime = values.worktime_type === "flextime";

  return (
    <div className="space-y-6">
      {/* Section 2. 労働時間制の専門判断 */}
      <FormSection title="2. 労働時間制の専門判断">
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
      <FormSection title="3. 管理監督者・特殊区分">
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
      <FormSection title="4. 固定残業代の設計">
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

        {isFixedOvertime && (
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

      {/* Section 5. 試用期間(顧客側で "あり" のときのみ) */}
      {showProbationSection && (
        <FormSection title="5. 試用期間の詳細">
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
        </FormSection>
      )}

      {/* Section 6. 最終チェック + 内部メモ */}
      <FormSection title="6. 最終チェック・納品メモ">
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
        {docxMessage && (
          <p className="mt-2 text-sm text-muted-foreground">{docxMessage}</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          現在のステータス: {STATUS_LABELS[status]}
          {dirty && <span className="ml-2 text-amber-700">(未保存)</span>}
        </p>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// サブコンポーネント
// -------------------------------------------------------------------------

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-4 md:p-5">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="space-y-4">{children}</div>
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
