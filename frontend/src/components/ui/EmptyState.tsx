type EmptyStateProps = {
  message: string;
  colSpan?: number;
};

/** Table empty-row helper — renders a centered muted message spanning all columns. */
export function EmptyTableRow({ message, colSpan = 5 }: EmptyStateProps) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <span className="muted">{message}</span>
      </td>
    </tr>
  );
}

/** Standalone empty state for non-table contexts. */
export function EmptyState({ message }: { message: string }) {
  return (
    <p className="muted" style={{ textAlign: "center", padding: "2rem 0" }}>
      {message}
    </p>
  );
}
