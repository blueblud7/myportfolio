import { redirect } from "next/navigation";

// 홈은 항상 대시보드로 보낸다.
// 비로그인 사용자는 /dashboard 에서 소프트게이트(블러 미리보기 + 회원가입 유도)를 만난다.
// 마케팅 랜딩은 /landing 으로 그대로 접근 가능하며 sitemap 에 인덱싱된다.
export default function RootPage() {
  redirect("/dashboard");
}
