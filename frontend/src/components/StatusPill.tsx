type StatusPillProps = {
  label: string;
  tone?: "green" | "gold" | "red" | "slate";
};

const toneClassMap: Record<NonNullable<StatusPillProps["tone"]>, string> = {
  green: "pill pill-green",
  gold: "pill pill-gold",
  red: "pill pill-red",
  slate: "pill pill-slate",
};

export function StatusPill({ label, tone = "slate" }: StatusPillProps) {
  return <span className={toneClassMap[tone]}>{label}</span>;
}
