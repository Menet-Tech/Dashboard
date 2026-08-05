import type { ReactNode } from "react";

type EmptyTableRowProps = {
  message: string;
  colSpan?: number;
};

/** Table empty-row helper — renders a centered muted message spanning all columns. */
export function EmptyTableRow({ message, colSpan = 5 }: EmptyTableRowProps) {
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
      <td className="px-6 py-8 text-center text-gray-500 dark:text-slate-400" colSpan={colSpan}>
        {message}
      </td>
    </tr>
  );
}

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description: string;
};

/** Standalone empty state for non-table contexts. */
export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && <div className="text-slate-400 dark:text-slate-500 mb-4">{icon}</div>}
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">{description}</p>
    </div>
  );
}
