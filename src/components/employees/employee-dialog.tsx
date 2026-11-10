"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, ApiError, errorText } from "@/lib/api";
import { COUNTRY_LABEL, EMPLOYMENT_LABEL, ROLE_LABEL } from "@/lib/format";

type Opt = { id: string; name: string };
type Employee = {
  id: string; name: string; email: string; role: string; countryCode: string; department: { id: string };
  managerId: string | null; joiningDate: string; employmentStatus: string; loginEnabled: boolean;
};

export function EmployeeDialog({ departments, managers, employee }: { departments: Opt[]; managers: Opt[]; employee?: Employee }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  /** Colleagues who can take over open work when this person's login is disabled. */
  const [successors, setSuccessors] = useState<Opt[] | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const common = {
      name: f.get("name"), role: f.get("role"), countryCode: f.get("countryCode"), departmentId: f.get("departmentId"),
      managerId: f.get("managerId") || null, joiningDate: f.get("joiningDate"), employmentStatus: f.get("employmentStatus"),
    };
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      if (employee) {
        const handOverToId = f.get("handOverToId");
        await api(`/employees/${employee.id}`, { method: "PATCH", body: { ...common, loginEnabled: f.get("loginEnabled") === "on", ...(handOverToId ? { handOverToId } : {}) } });
        setOpen(false);
      } else {
        const c = await api<{ id: string; name: string }>("/employees", { method: "POST", body: { ...common, email: f.get("email"), initialPassword: f.get("initialPassword") } });
        setCreated(c);
      }
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setFieldErrors(err.fieldErrors);
      setError(errorText(err));
      if (employee && err instanceof ApiError && err.code === "OPEN_WORK" && !successors) {
        api<{ id: string; name: string; loginEnabled: boolean }[]>(`/employees?departmentId=${employee.department.id}&pageSize=100`)
          .then((list) => setSuccessors(list.filter((u) => u.id !== employee.id && u.loginEnabled).map((u) => ({ id: u.id, name: u.name }))))
          .catch(() => setSuccessors([]));
      }
    } finally {
      setPending(false);
    }
  }

  const fe = (k: string) => (fieldErrors[k] ? <p className="text-xs text-destructive">{fieldErrors[k].join(" ")}</p> : null);
  const sel = "h-9 w-full rounded-md border bg-card px-2 text-sm";

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setCreated(null); setError(null); setFieldErrors({}); setSuccessors(null); } }}>
      <DialogTrigger asChild>
        {employee ? <Button variant="ghost" size="sm" aria-label={`Edit ${employee.name}`}>Edit</Button> : <Button>New employee</Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{employee ? `Edit ${employee.name}` : "New employee"}</DialogTitle>
          <DialogDescription>Role grants permissions; department is only the team. Login access is independent of employment status.</DialogDescription>
        </DialogHeader>
        {created ? (
          <div className="space-y-3 text-sm">
            <Alert><AlertDescription>{created.name} was created.</AlertDescription></Alert>
            <Button asChild><a href={`/onboarding/assign?employeeId=${created.id}`}>Assign onboarding checklist</a></Button>
          </div>
        ) : (
          <form onSubmit={submit} method="post" className="grid gap-3 sm:grid-cols-2" noValidate>
            {error ? <Alert variant="destructive" className="sm:col-span-2"><AlertDescription>{error}</AlertDescription></Alert> : null}
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="e-name">Full name</Label><Input id="e-name" name="name" defaultValue={employee?.name} required maxLength={120} />{fe("name")}</div>
            {!employee ? (
              <>
                <div className="space-y-1"><Label htmlFor="e-email">Email</Label><Input id="e-email" name="email" type="email" required />{fe("email")}</div>
                <div className="space-y-1"><Label htmlFor="e-pw">Initial password (12+ chars)</Label><Input id="e-pw" name="initialPassword" type="password" minLength={12} required autoComplete="new-password" />{fe("initialPassword")}</div>
              </>
            ) : null}
            <div className="space-y-1"><Label htmlFor="e-role">Role</Label>
              <select id="e-role" name="role" defaultValue={employee?.role ?? "EMPLOYEE"} className={sel}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>{fe("role")}</div>
            <div className="space-y-1"><Label htmlFor="e-country">Country</Label>
              <select id="e-country" name="countryCode" defaultValue={employee?.countryCode ?? "MY"} className={sel}>{Object.entries(COUNTRY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="space-y-1"><Label htmlFor="e-dept">Department</Label>
              <select id="e-dept" name="departmentId" defaultValue={employee?.department.id ?? departments[0]?.id} className={sel}>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>{fe("departmentId")}</div>
            <div className="space-y-1"><Label htmlFor="e-mgr">Manager</Label>
              <select id="e-mgr" name="managerId" defaultValue={employee?.managerId ?? ""} className={sel}><option value="">No manager</option>{managers.filter((m) => m.id !== employee?.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>{fe("managerId")}</div>
            <div className="space-y-1"><Label htmlFor="e-join">Joining date</Label><Input id="e-join" name="joiningDate" type="date" defaultValue={employee?.joiningDate} required />{fe("joiningDate")}</div>
            <div className="space-y-1"><Label htmlFor="e-status">Employment status</Label>
              <select id="e-status" name="employmentStatus" defaultValue={employee?.employmentStatus ?? "ON_PROBATION"} className={sel}>{Object.entries(EMPLOYMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            {employee ? (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="loginEnabled" defaultChecked={employee.loginEnabled} className="h-4 w-4" /> Login enabled (disabling signs the person out immediately)
              </label>
            ) : null}
            {fe("loginEnabled")}
            {successors ? (
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="e-handover">Hand open work over to</Label>
                <select id="e-handover" name="handOverToId" className={sel} defaultValue="">
                  <option value="">{successors.length ? "Choose a colleague in the same team" : "No active colleague in this team"}</option>
                  {successors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {fe("handOverToId")}
              </div>
            ) : null}
            <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : employee ? "Save changes" : "Create employee"}</Button></div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
