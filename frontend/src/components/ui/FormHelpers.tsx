export function inputClassName(error?: string) {
  return error ? "input-invalid" : undefined;
}

export function renderInlineError(error?: string) {
  if (!error) {
    return null;
  }
  return <span className="field-error">{error}</span>;
}
