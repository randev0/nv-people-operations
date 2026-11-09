import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell user={{ name: user.name, role: user.role, departmentName: user.departmentName, countryCode: user.countryCode }}>
      {children}
    </AppShell>
  );
}
