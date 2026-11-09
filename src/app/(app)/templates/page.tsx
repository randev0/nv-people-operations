import Link from "next/link";
import { requireUser } from "@/server/auth/current-user";
import { listTemplates } from "@/server/onboarding/templates";
import { load } from "@/server/page";
import { PageHeader, EmptyState } from "@/components/common/page-header";
import { Forbidden } from "@/components/common/forbidden";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatInstant } from "@/lib/format";

export const metadata = { title: "Templates · People Operations" };

export default async function TemplatesPage() {
  const me = await requireUser();
  const r = await load(() => listTemplates(me, { page: 1, pageSize: 100 }));
  if (!r.ok) return <Forbidden message={r.message} />;
  return (
    <>
      <PageHeader title="Onboarding templates" description="Edits apply to future assignments only; existing checklists keep their snapshot."
        actions={<Button asChild><Link href="/templates/new">New template</Link></Button>} />
      {r.data.data.length === 0 ? <EmptyState title="No templates yet." /> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {r.data.data.map((t) => (
            <li key={t.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/templates/${t.id}`} className="font-medium text-link hover:underline">{t.name}</Link>
                <Badge variant={t.isActive ? "success" : "muted"}>{t.isActive ? "Active" : "Archived"}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">{t.tasks.length} tasks · version {t.version} · updated {formatInstant(t.updatedAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
