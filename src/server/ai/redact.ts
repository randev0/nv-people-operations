/**
 * The suggested person is shown only to people who can assign the request, but the model's
 * free-text explanation may name them too. For everyone else, drop the sentences that
 * mention the person (full name or first name) so the explanation does not reveal them.
 */
export function explanationWithoutPerson(explanation: string | null, personName: string | null | undefined): string | null {
  if (!explanation || !personName) return explanation;
  const first = personName.trim().split(/\s+/)[0];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mentions = new RegExp(`\\b(${esc(personName.trim())}|${esc(first)})\\b`, "i");
  if (!mentions.test(explanation)) return explanation;
  const sentences = explanation.match(/[^.!?]+[.!?]*\s*/g) ?? [explanation];
  const kept = sentences.filter((s) => !mentions.test(s)).join("").trim();
  return kept || null;
}
