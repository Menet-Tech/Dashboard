import { inputClassName } from "./FormHelpers";

type RupiahInputProps = {
  value: number;
  onChange: (val: number) => void;
  label?: string;
  error?: string | string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export function RupiahInput({
  value,
  onChange,
  label,
  error,
  placeholder = "0",
  className = "",
  disabled = false,
}: RupiahInputProps) {
  const formattedValue = value ? value.toLocaleString("id-ID") : "";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    const num = parseInt(raw, 10) || 0;
    onChange(num);
  };

  const errStr = Array.isArray(error) ? error[0] : error;

  return (
    <label className="flex flex-col gap-1 w-full">
      {label && <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">{label}</span>}
      <div className="relative rounded-lg shadow-sm">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-sm font-semibold pointer-events-none select-none">
          Rp
        </span>
        <input
          type="text"
          className={`${inputClassName(errStr)} pl-9 ${className}`}
          value={formattedValue}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
        />
      </div>
    </label>
  );
}
