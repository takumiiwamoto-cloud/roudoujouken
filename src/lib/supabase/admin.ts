import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * service_role キーを使う管理用クライアント。
 * RLS をバイパスするので、サーバーサイド限定で慎重に使うこと。
 *
 * 用途:
 * - 顧客フォームのトークン認証で contract_requests を更新する処理
 * - Storage への docx アップロード
 * - 最低賃金マスタなどシステム管理データの操作
 *
 * `import "server-only"` により、Client Component からの import はビルド時に
 * エラーになる(誤って露出するのを防止)。
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
