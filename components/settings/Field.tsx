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
        <label className="text-sm font-medium text-zinc-300">{label}</label>
        {disabled && <EnvBadge />}
      </div>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      {disabled && (
        <p className="text-xs text-amber-400/80">
          Set via <code className="font-mono">{envVar}</code>
        </p>
      )}
    </div>
  );
}
