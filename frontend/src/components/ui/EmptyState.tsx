type EmptyStateProps = {
  message: string;
  colSpan?: number;
};

/** Table empty-row helper — renders a centered muted message spanning all columns. */
export function EmptyTableRow({ message, colSpan = 5 }: EmptyStateProps) {
  return (
    <tr>
      <td className="px-6 py-4 text-gray-700" colSpan={colSpan}>
        <span className="muted">{message}</span>
      </td>
    </tr>
  );
}

/** Standalone empty state for non-table contexts. */
export function EmptyState({ message }: { message: string }) {
  return (
    <p className="muted text-center py-8">
      {message}
    </p>
  );
}
