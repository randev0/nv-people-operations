import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-lg border bg-card p-8 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="mt-1 text-sm text-muted-foreground">This record doesn&apos;t exist or you don&apos;t have access to it.</p>
      <Link href="/dashboard" className="mt-3 inline-block text-sm text-primary hover:underline">Back to dashboard</Link>
    </div>
  );
}
