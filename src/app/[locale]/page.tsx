import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/auth";
import LandingPage from "./landing/page";

export default async function RootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (token) {
    const username = await verifySessionToken(token);
    if (username) redirect("/dashboard");
  }
  return <LandingPage />;
}
