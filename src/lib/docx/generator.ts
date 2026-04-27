import { promises as fs } from "node:fs";
import path from "node:path";

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ContractRequestRow } from "@/lib/supabase/types";
import type { ClientFormValues } from "@/lib/validations/client-form";
import type { OfficeInputValues } from "@/lib/validations/office-input";
import {
  emptyOfficeInput,
} from "@/lib/validations/office-input";
import { validateOfficeInput } from "@/lib/validations/office-side";
import {
  buildDocxContext,
  resolveEmploymentAsciiSlug,
  resolveEmploymentSlug,
  resolveTemplateFileName,
} from "./mapping";

/**
 * docx 生成のサーバー側ロジック。
 *
 *   1. contract_requests を取得
 *   2. Sheet05 のブロッキングバリデーションを再実行(多層防御)
 *   3. templates/ からひな形を読む(無ければ `template_missing` エラー)
 *   4. docxtemplater で差し込み
 *   5. Supabase Storage の generated-docx バケットに保存
 *      パス: `{request_id}/{yyyymmdd_HHmm}_{雇用形態スラッグ}.docx`
 *   6. contract_requests.generated_docx_path を更新
 *   7. 1時間有効な署名 URL(Content-Disposition 付き)を返却
 */

const BUCKET = "generated-docx";
const SIGNED_URL_EXPIRES_SEC = 60 * 60;

export type GenerateDocxError =
  | { kind: "not_found" }
  | { kind: "client_input_missing" }
  | { kind: "template_missing"; fileName: string }
  | { kind: "validation_failed"; titles: string[] }
  | { kind: "render_failed"; message: string }
  | { kind: "storage_failed"; message: string };

export type GenerateDocxSuccess = {
  url: string;
  path: string;
  downloadFileName: string;
};

export type GenerateDocxResult =
  | { ok: true; data: GenerateDocxSuccess }
  | { ok: false; error: GenerateDocxError };

function toClient(raw: unknown): ClientFormValues | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as ClientFormValues;
}

function toOffice(raw: unknown): OfficeInputValues {
  const base = emptyOfficeInput();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  return { ...base, ...(raw as Partial<OfficeInputValues>) };
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatTimestamp(d: Date): string {
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `_${pad2(d.getHours())}${pad2(d.getMinutes())}`
  );
}

function sanitizeForFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim() || "無題";
}

export async function generateDocxForRequest(
  requestId: string,
): Promise<GenerateDocxResult> {
  const supabase = createAdminClient();

  const { data: row, error } = await supabase
    .from("contract_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle<ContractRequestRow>();

  if (error) {
    console.error("[generate-docx] fetch error", error);
    return { ok: false, error: { kind: "storage_failed", message: "依頼情報の取得に失敗しました。" } };
  }
  if (!row) return { ok: false, error: { kind: "not_found" } };

  const client = toClient(row.client_input);
  const office = toOffice(row.office_input);

  if (!client) {
    return { ok: false, error: { kind: "client_input_missing" } };
  }

  // 多層防御: Sheet05 のブロッキングルールを再検査
  const validation = validateOfficeInput(client, office);
  if (!validation.canGenerate) {
    return {
      ok: false,
      error: {
        kind: "validation_failed",
        titles: validation.issues
          .filter((i) => i.severity === "error")
          .map((i) => i.title),
      },
    };
  }

  // ひな形読み込み
  const fileName = resolveTemplateFileName(client);
  if (!fileName) {
    return {
      ok: false,
      error: { kind: "template_missing", fileName: "(雇用形態未選択)" },
    };
  }
  const templatePath = path.join(process.cwd(), "templates", fileName);

  let templateBuffer: Buffer;
  try {
    templateBuffer = await fs.readFile(templatePath);
  } catch (e) {
    console.error("[generate-docx] template read failed", fileName, e);
    return { ok: false, error: { kind: "template_missing", fileName } };
  }

  // docx 差し込み
  const context = buildDocxContext({
    companyName: row.company_name,
    companyAddress: row.company_address,
    representativeName: row.representative_name,
    client,
    office,
  });

  let rendered: Buffer;
  try {
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });
    doc.render(context);
    rendered = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
  } catch (e) {
    const msg = serializeDocxError(e);
    console.error("[generate-docx] render failed", msg);
    return { ok: false, error: { kind: "render_failed", message: msg } };
  }

  // Storage へ保存
  const now = new Date();
  // Storage キーは ASCII 限定。表示用(ダウンロードファイル名)のみ日本語を使う。
  const asciiSlug = resolveEmploymentAsciiSlug(client);
  const displaySlug = resolveEmploymentSlug(client);
  const storagePath = `${requestId}/${formatTimestamp(now)}_${asciiSlug}.docx`;
  const employeeNameJa =
    sanitizeForFilename(`${client.last_name ?? ""}${client.first_name ?? ""}`) ||
    "従業員";
  const downloadFileName = `労働条件通知書_${sanitizeForFilename(row.company_name)}_${employeeNameJa}_${displaySlug}.docx`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, rendered, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });

  if (uploadError) {
    console.error("[generate-docx] upload failed", uploadError);
    return {
      ok: false,
      error: {
        kind: "storage_failed",
        message:
          uploadError.message.includes("Bucket not found") ||
          uploadError.message.includes("The resource was not found")
            ? `Supabase Storage に '${BUCKET}' バケットを作成してください(Private 推奨)。`
            : `Storage アップロードに失敗しました: ${uploadError.message}`,
      },
    };
  }

  const { error: updateError } = await supabase
    .from("contract_requests")
    .update({ generated_docx_path: storagePath })
    .eq("id", requestId);

  if (updateError) {
    console.error("[generate-docx] update path failed", updateError);
    // アップロードは成功しているので続行可能。警告ログのみ。
  }

  // Content-Disposition に日本語ファイル名を含めると URL エンコード済の文字列が
  // そのまま表示されてしまう(Supabase Storage が RFC 5987 対応していない)。
  // ここでは download オプションを付けず、クライアント側で blob ダウンロード時に
  // a.download 属性でファイル名を付与する。
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRES_SEC);

  if (signError || !signed) {
    console.error("[generate-docx] sign url failed", signError);
    return {
      ok: false,
      error: {
        kind: "storage_failed",
        message: "署名URLの発行に失敗しました。",
      },
    };
  }

  return {
    ok: true,
    data: {
      url: signed.signedUrl,
      path: storagePath,
      downloadFileName,
    },
  };
}

function serializeDocxError(e: unknown): string {
  if (!e || typeof e !== "object") return String(e);
  type DocxError = {
    message?: string;
    properties?: { errors?: Array<{ message?: string; properties?: { explanation?: string; id?: string } }> };
  };
  const err = e as DocxError;
  const sub = err.properties?.errors;
  if (Array.isArray(sub) && sub.length > 0) {
    return sub
      .map((s) => s.properties?.explanation ?? s.message ?? "unknown")
      .join(" / ");
  }
  return err.message ?? String(e);
}
