import { AlertTriangle, Inbox, RefreshCw, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

export type StatusTone = 'neutral' | 'info' | 'verified' | 'approval' | 'danger';

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: StatusTone }): React.JSX.Element {
  return <span className={`status-badge status-badge-${tone}`}>{label}</span>;
}

interface StatePanelProps {
  title: string;
  description: string;
  actionLabel?: string;
  icon?: LucideIcon;
  tone?: 'empty' | 'error';
  compact?: boolean;
  onAction?(): void;
}

export function StatePanel({
  title,
  description,
  actionLabel,
  icon: Icon,
  tone = 'empty',
  compact = false,
  onAction
}: StatePanelProps): React.JSX.Element {
  const StateIcon = Icon ?? (tone === 'error' ? AlertTriangle : Inbox);

  return (
    <section
      className={`state-panel state-panel-${tone} ${compact ? 'state-panel-compact' : ''}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      <span className="state-panel-icon" aria-hidden="true"><StateIcon size={22} /></span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actionLabel && onAction && (
        <button className="secondary-button" type="button" onClick={onAction}>
          <RefreshCw size={16} aria-hidden="true" />
          {actionLabel}
        </button>
      )}
    </section>
  );
}

export function WorkspaceLoadingState(): React.JSX.Element {
  return (
    <div className="loading-page" role="status" aria-live="polite" aria-label="Loading H2A workspace">
      <span className="sr-only">Loading H2A workspace</span>
      <div className="skeleton-metrics" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => <span className="skeleton-block" key={index} />)}
      </div>
      <div className="skeleton-heading skeleton-block" aria-hidden="true" />
      <div className="skeleton-agents" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => <span className="skeleton-card skeleton-block" key={index} />)}
      </div>
      <div className="skeleton-board skeleton-block" aria-hidden="true" />
    </div>
  );
}

interface ModalDialogProps {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose(): void;
}

export function ModalDialog({ open, title, description, children, footer, onClose }: ModalDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (document.querySelector('dialog.proof-challenge-scrim[open]')) return;
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-surface">
        <header className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button className="icon-button" type="button" aria-label="Close dialog" title="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="modal-content">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </dialog>
  );
}

export interface DataTableColumn<Row> {
  id: string;
  label: string;
  render(row: Row): React.ReactNode;
}

interface DataTableProps<Row> {
  caption: string;
  columns: Array<DataTableColumn<Row>>;
  rows: Row[];
  rowKey(row: Row): string;
}

export function DataTable<Row>({ caption, columns, rows, rowKey }: DataTableProps<Row>): React.JSX.Element {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={`${caption} table`}>
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{columns.map((column) => <th key={column.id} scope="col">{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>{columns.map((column) => <td key={column.id}>{column.render(row)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
