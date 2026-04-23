import "server-only";
import { readdirSync } from "fs";
import path from "path";

/**
 * `templates/` フォルダ直下の docx ファイル一覧(ファイル名のみ)を返す。
 *
 * プロンプト4-B 新規URL発行画面のひな形選択プルダウン用。
 * ファイル名はそのまま contract_requests.template_name に保存される。
 *
 * 注意: templates/ は public/ ではなく project root の templates/ を参照。
 * Vercel 本番でも Next.js は file system を参照できる(読み取りのみ)。
 * アップロード機能が必要になった場合は Supabase Storage に切り替える想定。
 *
 * 並び順: 雇用形態の一般的な重要度(正社員→契約社員→パート無期→パート有期)を
 * 優先し、それ以外(将来追加される任意ファイル)はその後ろにファイル名昇順で続ける。
 */
const TEMPLATE_PRIORITY = [
  "正社員",
  "契約社員",
  "パート無期",
  "パート有期",
] as const;

function templateRank(filename: string): number {
  const idx = TEMPLATE_PRIORITY.findIndex((key) => filename.includes(key));
  return idx === -1 ? TEMPLATE_PRIORITY.length : idx;
}

export function listTemplateFiles(): string[] {
  const dir = path.join(process.cwd(), "templates");
  try {
    return readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith(".docx") && !name.startsWith("~"))
      .sort((a, b) => {
        const ra = templateRank(a);
        const rb = templateRank(b);
        if (ra !== rb) return ra - rb;
        return a.localeCompare(b, "ja");
      });
  } catch (e) {
    console.error("[listTemplateFiles] failed to read templates/", e);
    return [];
  }
}
