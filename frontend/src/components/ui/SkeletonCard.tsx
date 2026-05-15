export function SkeletonCard() {
  return (
    <article className="stat-card" aria-hidden="true">
      <div className="flex flex-col gap-3">
        <span className="block h-3.5 w-[42%] rounded-full bg-slate-200 animate-pulse" />
        <span className="block h-8 w-[64%] rounded-full bg-slate-200 animate-pulse" />
      </div>
    </article>
  );
}
