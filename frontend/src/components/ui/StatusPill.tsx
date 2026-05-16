import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const pillVariants = cva(
  "inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
  {
    variants: {
      tone: {
        green: "text-green-800 bg-green-100",
        gold:  "text-amber-800 bg-amber-100",
        red:   "text-red-800 bg-red-100",
        slate: "text-slate-800 bg-slate-100",
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
