import Link from "next/link";
import { requireUser } from "@/server/auth/current-user";
import { isHrAdmin } from "@/server/auth/permissions";
import { listDepartments, listEmployees, managerOptions } from "@/server/people/service";
import { listEmployeesQuery } from "@/server/people/schemas";
import { load, sp } from "@/server/page";
import { PageHeader, EmptyState } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { Forbidden } from "@/components/common/forbidden";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmployeeDialog } from "@/components/employees/employee-dialog";
import { COUNTRY_LABEL, EMPLOYMENT_LABEL, ROLE_LABEL, formatCalendarDate } from "@/lib/format";

export const metadata = { title: "Employees · People Operations" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireUser();
  const raw = await searchParams;
  const params = { q: sp(raw.q), countryCode: sp(raw.countryCode), departmentId: sp(raw.departmentId), employmentStatus: sp(raw.employmentStatus), page: sp(raw.page) };
  const parsed = listEmployeesQuery.safeParse(Object.fromEntries(Object.entries(params).filter(([, v]) => v)));
  if (!parsed.success) return <Forbidden message="Invalid filter values." />;
  const r = await load(() => listEmployees(me, parsed.data));
  if (!r.ok) return <Forbidden message={r.message} />;
  const hr = isHrAdmin(me);
  const [departments, managers] = await Promise.all([listDepartments(), hr ? managerOptions(me) : Promise.resolve([])]);
  return (
    <>
      <PageHeader
        title={hr ? "Employees" : "My team"}
        description={hr ? "All employees. Account access is separate from employment status." : "You and your direct reports (read-only)."}
        actions={hr ? <EmployeeDialog departments={departments} managers={managers} /> : null}
      />
      <form method="get" className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5" aria-label="Filters">
        <label className="col-span-2 text-sm"><span className="sr-only">Search</span>
          <input name="q" defaultValue={params.q} placeholder="Search name or email" className="h-9 w-full rounded-md border bg-card px-3" />
        </label>
        <Sel name="countryCode" label="Country" value={params.countryCode} options={Object.entries(COUNTRY_LABEL)} />
        <Sel name="departmentId" label="Department" value={params.departmentId} options={departments.map((d) => [d.id, d.name])} />
        <Sel name="employmentStatus" label="Status" value={params.employmentStatus} options={Object.entries(EMPLOYMENT_LABEL)} />
        <div className="col-span-2 flex gap-2 md:col-span-5">
          <Button type="submit" variant="secondary" size="sm">Apply filters</Button>
          <Button asChild variant="ghost" size="sm"><Link href="/employees">Reset</Link></Button>
        </div>
      </form>
      {r.data.data.length === 0 ? <EmptyState title="No employees match." /> : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Department</TableHead>
                <TableHead className="hidden md:table-cell">Country</TableHead>
                <TableHead className="hidden lg:table-cell">Role</TableHead>
                <TableHead className="hidden lg:table-cell">Manager</TableHead>
                <TableHead className="hidden xl:table-cell">Joined</TableHead>
                <TableHead>Status</TableHead>
                {hr ? <TableHead><span className="sr-only">Actions</span></TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.data.data.map((e) => (
                <TableRow key={e.id}>
                  <TableCell><span className="font-medium">{e.name}</span><p className="text-xs text-muted-foreground">{e.email}</p></TableCell>
                  <TableCell className="hidden md:table-cell">{e.department.name}</TableCell>
                  <TableCell className="hidden md:table-cell">{COUNTRY_LABEL[e.countryCode]}</TableCell>
                  <TableCell className="hidden lg:table-cell">{ROLE_LABEL[e.role]}</TableCell>
                  <TableCell className="hidden lg:table-cell">{e.manager?.name ?? "—"}</TableCell>
                  <TableCell className="hidden xl:table-cell">{formatCalendarDate(e.joiningDate)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={e.employmentStatus === "ACTIVE" ? "secondary" : e.employmentStatus === "ON_NOTICE" ? "warning" : "info"}>{EMPLOYMENT_LABEL[e.employmentStatus]}</Badge>
                      {!e.loginEnabled ? <Badge variant="danger">Login disabled</Badge> : null}
                    </div>
                  </TableCell>
                  {hr ? <TableCell><EmployeeDialog departments={departments} managers={managers} employee={e} /></TableCell> : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination {...r.data.meta} baseHref="/employees" params={{ ...params, page: undefined }} />
    </>
  );
}

function Sel({ name, label, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) {
  return (
    <label className="text-sm"><span className="sr-only">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="h-9 w-full rounded-md border bg-card px-2">
        <option value="">{label}: any</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
