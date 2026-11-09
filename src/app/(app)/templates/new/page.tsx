import { requireUser } from "@/server/auth/current-user";
import { isHrAdmin } from "@/server/auth/permissions";
import { listDepartments } from "@/server/people/service";
import { PageHeader } from "@/components/common/page-header";
import { Forbidden } from "@/components/common/forbidden";
import { TemplateEditor } from "@/components/onboarding/template-editor";

export const metadata = { title: "New template · People Operations" };

export default async function NewTemplatePage() {
  const me = await requireUser();
  if (!isHrAdmin(me)) return <Forbidden message="Only HR admins can manage templates." />;
  return (
    <>
      <PageHeader title="New onboarding template" />
      <TemplateEditor departments={await listDepartments()} />
    </>
  );
}
