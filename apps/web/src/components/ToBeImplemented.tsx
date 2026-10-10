/**
 * A plain banner for anything that is not real yet. A made-up number is never shown without one, so nobody
 * mistakes a placeholder for a measurement.
 */
export function ToBeImplemented({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <aside className="tbi" role="note" aria-label="To be implemented">
      <strong>To be implemented</strong>
      <span>{children}</span>
    </aside>
  );
}
