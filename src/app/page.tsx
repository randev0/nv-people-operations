import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";

export default async function Home() {
  redirect((await getCurrentUser()) ? "/dashboard" : "/login");
}
