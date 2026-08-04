/**
 * SkeletonCard — Loading placeholder that mimics actual card content layout.
 * Uses aria-hidden="true" so screen readers skip it completely.
 */
export function SkeletonCard() {
  return (
    <article
      className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm"
      aria-hidden="true"
    >
      <div className="flex flex-col gap-3">
        {/* Label / category line */}
        <span className="block h-2.5 w-1/3 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
        {/* Main value line */}
        <span className="block h-8 w-2/3 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
        {/* Sub-info lines */}
        <div className="flex flex-col gap-1.5 mt-1">
          <span className="block h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse" />
          <span className="block h-2 w-4/5 rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse" />
        </div>
      </div>
    </article>
  );
}
