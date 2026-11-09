import { lowerFirst } from "./format";

type Prereq = { title: string; status: string; departmentName: string };

/** Plain-language reason a task cannot start yet ("Waiting for IT to create company account (in progress)"). */
export function blockedReason(prereqs: Prereq[]): string {
  const open = prereqs.filter((p) => p.status !== "COMPLETED");
  if (!open.length) return "";
  const parts = open.map((p) => {
    const who = p.departmentName === "Manager" ? "the manager" : p.departmentName;
    return `${who} to ${lowerFirst(p.title)}${p.status === "IN_PROGRESS" ? " (in progress)" : ""}`;
  });
  return `Waiting for ${parts.join(", and for ")}`;
}
