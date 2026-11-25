import type { Step } from "@/lib/useMint";

const STEPS: { key: Step; label: string; hint: string }[] = [
  { key: "committed", label: "Committed", hint: "Your mint is on chain with your secret's commitment." },
  { key: "lockPassed", label: "Lock block passed", hint: "A block nobody knew at commit time now exists." },
  { key: "houseRevealed", label: "House revealed", hint: "The house posted its value, fixed in advance by its hash chain." },
  { key: "userRevealSent", label: "Your reveal sent", hint: "Your secret is posted; the result is fixed." },
  { key: "revealed", label: "Traits revealed", hint: "Traits and art are final." },
];
const ORDER: Step[] = ["idle", "committing", "committed", "lockPassed", "houseRevealed", "userRevealSent", "revealed"];

export function StepTracker({ step }: { step: Step }) {
  const at = step === "timedOut" ? ORDER.length : ORDER.indexOf(step);
  return (
    <ol className="steps">
      {STEPS.map((s) => {
        const i = ORDER.indexOf(s.key);
        const cls = at > i || (s.key === "revealed" && step === "revealed") ? "done" : at === i || (at === i - 1 && step !== "idle") ? "now" : "";
        return (
          <li key={s.key} className={cls} title={s.hint}>
            {s.label} <span className="small muted">— {s.hint}</span>
          </li>
        );
      })}
    </ol>
  );
}
