import { EnvBadge } from './EnvBadge';

export function Field({
  label,
  envVar,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  envVar: string;
  hint?: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-text-secondary">{label}</label>
        {disabled && <EnvBadge />}
      </div>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface-2 border border-border rounded-lg px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-strong disabled:opacity-50 disabled:cursor-not-allowed"
      />
      {disabled && (
        <p className="text-xs text-amber-400/80">
          Set via <code className="font-mono">{envVar}</code>
        </p>
      )}
    </div>
  );
}
