import { destroySession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export async function GET() {
  await destroySession();
  redirect("/login");
}
