"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { createRequestAction, type CreateRequestResult } from "./actions";

/**
 * O-03 新規URL発行フォーム(Client)
 *
 * プロンプト4-B:
 *   - 入力 → Server Action 呼び出し → 成功時は発行URLパネルに切替
 *   - 発行URL「コピー」・「ダッシュボードに戻る」を提供
 */

type Props = {
  templates: string[];
  defaultExpiresOn: string; // YYYY-MM-DD(既定 14日後)
};

type FormState = {
  company_name: string;
  representative_name: string;
  company_address: string;
  template_name: string;
  expires_on: string;
};

export function NewRequestForm({ templates, defaultExpiresOn }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>({
    company_name: "",
    representative_name: "",
    company_address: "",
    template_name: templates[0] ?? "",
    expires_on: defaultExpiresOn,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<
    Extract<CreateRequestResult, { ok: true }> | null
  >(null);
  const [copied, setCopied] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    setErrors({});
    startTransition(async () => {
      const r = await createRequestAction(form);
      if (!r.ok) {
        setSubmitError(r.error);
        setErrors(r.fieldErrors ?? {});
        return;
      }
      setResult(r);
    });
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API が使えない環境向けフォールバック
      const input = document.getElementById(
        "issued-url",
      ) as HTMLInputElement | null;
      input?.select();
      document.execCommand?.("copy");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-5">
          <h2 className="font-semibold text-emerald-900">
            URLを発行しました
          </h2>
          <p className="mt-1 text-sm text-emerald-900">
            以下の URL を顧客へメール等で共有してください。トークンは
            発行後のこの画面でしか表示されません。
          </p>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="issued-url">発行URL</Label>
            <div className="flex gap-2">
              <Input
                id="issued-url"
                readOnly
                value={result.url}
                onFocus={(e) => e.currentTarget.select()}
                className="bg-white"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleCopy}
              >
                {copied ? "コピーしました" : "コピー"}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard")}
          >
            ダッシュボードに戻る
          </Button>
          <Button asChild variant="ghost">
            <Link href={`/detail/${result.id}`}>この依頼の詳細へ</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="company_name">
          会社名 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="company_name"
          value={form.company_name}
          onChange={(e) => update("company_name", e.target.value)}
          required
          disabled={isPending}
          aria-invalid={errors.company_name ? true : undefined}
        />
        {errors.company_name && (
          <p className="text-xs text-destructive">{errors.company_name}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="representative_name">
          代表者氏名 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="representative_name"
          value={form.representative_name}
          onChange={(e) => update("representative_name", e.target.value)}
          required
          disabled={isPending}
          aria-invalid={errors.representative_name ? true : undefined}
        />
        {errors.representative_name && (
          <p className="text-xs text-destructive">
            {errors.representative_name}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="company_address">
          会社所在地 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="company_address"
          value={form.company_address}
          onChange={(e) => update("company_address", e.target.value)}
          required
          disabled={isPending}
          placeholder="例: 東京都千代田区丸の内1-1-1"
          aria-invalid={errors.company_address ? true : undefined}
        />
        {errors.company_address && (
          <p className="text-xs text-destructive">{errors.company_address}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="template_name">
          ひな形 <span className="text-destructive">*</span>
        </Label>
        <Select
          value={form.template_name}
          onValueChange={(v) => update("template_name", v)}
          disabled={isPending || templates.length === 0}
        >
          <SelectTrigger id="template_name" aria-invalid={errors.template_name ? true : undefined}>
            <SelectValue
              placeholder={
                templates.length === 0
                  ? "ひな形が見つかりません"
                  : "選択してください"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.template_name && (
          <p className="text-xs text-destructive">{errors.template_name}</p>
        )}
        {templates.length === 0 && (
          <p className="text-xs text-destructive">
            templates/ フォルダに docx ファイルが見つかりません。
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="expires_on">
          URL有効期限 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="expires_on"
          type="date"
          value={form.expires_on}
          onChange={(e) => update("expires_on", e.target.value)}
          required
          disabled={isPending}
          aria-invalid={errors.expires_on ? true : undefined}
        />
        <p className="text-xs text-muted-foreground">
          既定は本日から14日後。必要に応じて変更してください(指定日の23:59まで有効)。
        </p>
        {errors.expires_on && (
          <p className="text-xs text-destructive">{errors.expires_on}</p>
        )}
      </div>

      {submitError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"
        >
          {submitError}
        </p>
      )}

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isPending || templates.length === 0}>
          {isPending ? "発行中..." : "URLを発行する"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/dashboard")}
          disabled={isPending}
        >
          キャンセル
        </Button>
      </div>
    </form>
  );
}
