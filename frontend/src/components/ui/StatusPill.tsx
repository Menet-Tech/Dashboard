import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const pillVariants = cva(
  "inline-flex items-center justify-center min-w-[5.5rem] px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider",
  {
    variants: {
      tone: {
        green: "text-green-800 bg-green-100",
        gold:  "text-amber-800 bg-amber-100",
        red:   "text-red-800   bg-red-100",
        slate: "text-slate-700 bg-slate-200",
      },
    },
    defaultVariants: { tone: "slate" },
  },
);

export type StatusPillTone = NonNullable<VariantProps<typeof pillVariants>["tone"]>;

type StatusPillProps = {
  label: string;
  tone?: StatusPillTone;
  className?: string;
};

export function StatusPill({ label, tone = "slate", className }: StatusPillProps) {
  return <span className={cn(pillVariants({ tone }), className)}>{label}</span>;
}
