/** Shows "1,234 / 5,000" once a field is past 80% of its limit, so text is never cut off unnoticed. */
export function CharCount({ value, max, id }: { value: string; max: number; id?: string }) {
  if (value.length < max * 0.8) return null;
  const left = max - value.length;
  return (
    <p id={id} aria-live="polite" className={left <= 0 ? "text-right text-xs text-warning" : "text-right text-xs text-muted-foreground"}>
      {value.length.toLocaleString("en-GB")} / {max.toLocaleString("en-GB")}{left <= 0 ? " · limit reached" : ""}
    </p>
  );
}
