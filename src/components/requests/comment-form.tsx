"use client";

import { CharCount } from "@/components/common/char-count";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, errorText } from "@/lib/api";

export function CommentForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPending(true);
    setError(null);
    try {
      await api(`/requests/${requestId}/comments`, { method: "POST", body: { body } });
      setBody("");
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} method="post" className="space-y-2">
      <Label htmlFor="comment" className="text-sm font-semibold">Add a comment</Label>
      <Textarea id="comment" rows={3} maxLength={3000} value={body} onChange={(e) => setBody(e.target.value)} />
      <CharCount value={body} max={3000} />
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <Button type="submit" size="sm" disabled={pending || !body.trim()}>{pending ? "Posting…" : "Post comment"}</Button>
    </form>
  );
}
