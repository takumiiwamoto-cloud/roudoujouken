/**
 * Supabase Database 型定義
 *
 * このファイルは `supabase gen types typescript` で自動生成される出力を
 * 手書きで**仮置き**したもの。マイグレーション
 *   - supabase/migrations/20260422_001_create_contract_requests.sql
 *   - supabase/migrations/20260422_002_create_minimum_wage_master.sql
 *   - supabase/migrations/20260422_003_seed_minimum_wage.sql
 * と整合するよう記述している。
 *
 * Supabase プロジェクトに SQL を適用したあとは、CLI が利用可能なら
 *   pnpm dlx supabase gen types typescript --project-id <PROJECT_ID> \
 *     --schema public > src/lib/supabase/types.ts
 * で再生成して本ファイルを置き換えるのが望ましい。
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ContractRequestStatus =
  | "pending"
  | "submitted"
  | "reviewed"
  | "delivered";

export interface Database {
  public: {
    Tables: {
      contract_requests: {
        Row: {
          id: string;
          access_token: string;
          status: ContractRequestStatus;
          expires_at: string;
          company_name: string;
          company_address: string;
          representative_name: string;
          template_name: string;
          client_input: Json | null;
          office_input: Json | null;
          generated_docx_path: string | null;
          submitted_at: string | null;
          delivered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          access_token: string;
          status?: ContractRequestStatus;
          expires_at: string;
          company_name: string;
          company_address: string;
          representative_name: string;
          template_name: string;
          client_input?: Json | null;
          office_input?: Json | null;
          generated_docx_path?: string | null;
          submitted_at?: string | null;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          access_token?: string;
          status?: ContractRequestStatus;
          expires_at?: string;
          company_name?: string;
          company_address?: string;
          representative_name?: string;
          template_name?: string;
          client_input?: Json | null;
          office_input?: Json | null;
          generated_docx_path?: string | null;
          submitted_at?: string | null;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      minimum_wage_master: {
        Row: {
          prefecture: string;
          hourly_wage: number;
          effective_date: string;
        };
        Insert: {
          prefecture: string;
          hourly_wage: number;
          effective_date: string;
        };
        Update: {
          prefecture?: string;
          hourly_wage?: number;
          effective_date?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/** 便利エイリアス: アプリコードでは基本こちらを参照する。 */
export type ContractRequestRow =
  Database["public"]["Tables"]["contract_requests"]["Row"];
export type ContractRequestInsert =
  Database["public"]["Tables"]["contract_requests"]["Insert"];
export type ContractRequestUpdate =
  Database["public"]["Tables"]["contract_requests"]["Update"];

export type MinimumWageRow =
  Database["public"]["Tables"]["minimum_wage_master"]["Row"];
