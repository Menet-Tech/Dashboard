export function SkeletonCard() {
  return (
    <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm" aria-hidden="true">
      <div className="flex flex-col gap-3">
        <span className="block h-3.5 w-[42%] rounded-full bg-slate-200 animate-pulse" />
        <span className="block h-8 w-[64%] rounded-full bg-slate-200 animate-pulse" />
      </div>
    </article>
  );
}
