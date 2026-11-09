import { requireUser } from "@/server/auth/current-user";
import { getTemplate } from "@/server/onboarding/templates";
import { listDepartments } from "@/server/people/service";
import { routeIdOrNotFound } from "@/server/route-params-page";
import { load } from "@/server/page";
import { PageHeader } from "@/components/common/page-header";
import { Forbidden } from "@/components/common/forbidden";
import { TemplateEditor } from "@/components/onboarding/template-editor";

export const metadata = { title: "Edit template · People Operations" };

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = routeIdOrNotFound((await params).id);
  const r = await load(() => getTemplate(me, id));
  if (!r.ok) return <Forbidden message={r.message} />;
  return (
    <>
      <PageHeader title={`Edit: ${r.data.name}`} description={`Version ${r.data.version}. Saving creates version ${r.data.version + 1}; assigned checklists are not changed.`} />
      <TemplateEditor departments={await listDepartments()} template={r.data} />
    </>
  );
}
