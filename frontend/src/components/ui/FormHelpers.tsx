export function inputClassName(error?: string) {
  const base = "block w-full rounded-lg border px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-1 transition-all duration-200";
  if (error) {
    return `${base} border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-500 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400 dark:focus:border-red-550`;
  }
  return `${base} border-gray-300 bg-white focus:border-indigo-500 focus:ring-indigo-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-500 dark:focus:ring-indigo-500`;
}

export function renderInlineError(error?: string) {
  if (!error) {
    return null;
  }
  return <span className="text-sm text-red-600 mt-1 block font-medium">{error}</span>;
}
