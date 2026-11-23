import { cn } from "@/lib/cn";

type Answer = { id: string; question: string; answer: string };

/** What a client answered to the booking questions in the widget, as shown on a planned viewing. */
export function BookingAnswers({ answers, className, compact }: { answers: Answer[]; className?: string; compact?: boolean }) {
  if (!answers.length) return null;
  return (
    <dl className={cn("flex flex-col", compact ? "gap-1 text-[12px]" : "gap-2", className)}>
      {answers.map((a) => (
        <div key={a.id} className={compact ? "flex flex-wrap gap-x-1.5" : undefined}>
          <dt className={compact ? "text-muted" : "text-[12px] text-muted"}>
            {a.question}
            {compact && !/[?:]$/.test(a.question.trim()) && ":"}
          </dt>
          <dd className="whitespace-pre-line">{a.answer}</dd>
        </div>
      ))}
    </dl>
  );
}
