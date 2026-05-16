export function inputClassName(error?: string) {
  const base = "block w-full rounded-lg border px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-1 transition-colors";
  if (error) {
    return `${base} border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-500`;
  }
  return `${base} border-gray-300 bg-white focus:border-indigo-500 focus:ring-indigo-500`;
}

export function renderInlineError(error?: string) {
  if (!error) {
    return null;
  }
  return <span className="text-sm text-red-600 mt-1 block font-medium">{error}</span>;
}
