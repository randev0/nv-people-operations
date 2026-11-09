import { requirePageUser as requireUser } from "@/server/auth/page-user";
import { listCategories } from "@/server/requests/service";
import { listDepartments } from "@/server/people/service";
import { PageHeader } from "@/components/common/page-header";
import { NewRequestForm } from "@/components/requests/new-request-form";

export const metadata = { title: "New request · People Operations" };

export default async function NewRequestPage() {
  await requireUser();
  const [categories, departments] = await Promise.all([listCategories(), listDepartments()]);
  return (
    <>
      <PageHeader title="New service request" description="Describe what you need. You can ask for a routing suggestion before submitting." />
      <NewRequestForm categories={categories} departments={departments} />
    </>
  );
}
