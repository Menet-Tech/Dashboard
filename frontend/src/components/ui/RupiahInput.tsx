import { inputClassName } from "./FormHelpers";
import { useRef } from "react";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const formattedValue = value ? value.toLocaleString("id-ID") : "";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const start = el.selectionStart || 0;
    const newValue = el.value;
    
    const raw = newValue.replace(/[^0-9]/g, "");
    const num = parseInt(raw, 10) || 0;

    // Track digits before cursor to restore position
    const digitsBeforeCursor = newValue.slice(0, start).replace(/[^0-9]/g, "").length;

    onChange(num);

    // Restore cursor position after render
    window.requestAnimationFrame(() => {
      if (!inputRef.current) return;
      const currentVal = inputRef.current.value;
      let digitCount = 0;
      let newPos = 0;
      for (let i = 0; i < currentVal.length; i++) {
        if (digitCount === digitsBeforeCursor) {
          newPos = i;
          break;
        }
        if (/[0-9]/.test(currentVal[i])) {
          digitCount++;
        }
      }
      if (digitCount === digitsBeforeCursor) newPos = currentVal.length;
      inputRef.current.setSelectionRange(newPos, newPos);
    });
  };

  const errStr = Array.isArray(error) ? error[0] : error;

  return (
    <label className="flex flex-col gap-1 w-full">
      {label && <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300">{label}</span>}
      <div className="relative rounded-lg shadow-sm">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-sm font-semibold pointer-events-none select-none">
          Rp
        </span>
        <input
          ref={inputRef}
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
