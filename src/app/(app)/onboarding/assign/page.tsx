import { requireUser } from "@/server/auth/current-user";
import { listTemplates } from "@/server/onboarding/templates";
import { unassignedEmployees } from "@/server/onboarding/service";
import { load, sp } from "@/server/page";
import { PageHeader } from "@/components/common/page-header";
import { Forbidden } from "@/components/common/forbidden";
import { AssignWizard } from "@/components/onboarding/assign-wizard";

export const metadata = { title: "Assign checklist · People Operations" };

export default async function AssignPage({ searchParams }: { searchParams: Promise<{ employeeId?: string }> }) {
  const me = await requireUser();
  const r = await load(async () => ({
    templates: (await listTemplates(me, { page: 1, pageSize: 100, active: "true" })).data,
    employees: await unassignedEmployees(me),
  }));
  if (!r.ok) return <Forbidden message={r.message} />;
  return (
    <>
      <PageHeader title="Assign onboarding checklist" description="Pick a new hire and template, review the calculated deadlines, then choose an owner for every task." />
      <AssignWizard templates={r.data.templates.map((t) => ({ id: t.id, name: t.name, taskCount: t.tasks.length }))} employees={r.data.employees} initialEmployeeId={sp((await searchParams).employeeId)} />
    </>
  );
}
