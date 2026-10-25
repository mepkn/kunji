/** Placeholder for a section that later build steps fill in (SPEC.md → Build order). */
export function SectionPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
      <div className="mt-6 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Nothing here yet.
      </div>
    </div>
  );
}
