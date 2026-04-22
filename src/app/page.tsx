import { redirect } from "next/navigation";

/**
 * ルートアクセス時は事務所側ダッシュボードへリダイレクト。
 * 顧客は事務所が発行する `/form/[token]` URL に直接アクセスする運用なので、
 * ルート(`/`)に到達するのは事務所スタッフのみという想定。
 * 未認証時は middleware/(admin) のレイアウトでログイン画面に飛ばす(Day 9-10で実装)。
 */
export default function RootPage() {
  redirect("/dashboard");
}
