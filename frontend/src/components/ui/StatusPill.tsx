import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const pillVariants = cva(
  "inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
  {
    variants: {
      tone: {
        green: "text-green-800 bg-green-100 dark:text-green-450 dark:bg-green-950/45",
        gold:  "text-amber-800 bg-amber-100 dark:text-amber-400 dark:bg-amber-950/45",
        red:   "text-red-800 bg-red-100 dark:text-red-400 dark:bg-red-950/45",
        slate: "text-slate-800 bg-slate-100 dark:text-slate-400 dark:bg-slate-800",
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
