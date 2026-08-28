import type { BasketFeedback, PlanDiversity, PlanStyle } from "@/domain/types";
import { SLOT_LABEL } from "@/lib/labels";

export function BasketOutcomeSummary({
  breakfastCount,
  mainsCount,
  diversity,
  style,
  days,
  showBreakfast = true,
}: {
  breakfastCount: number;
  mainsCount: number;
  diversity: PlanDiversity | null;
  style: PlanStyle;
  days: number;
  showBreakfast?: boolean;
}) {
  const repeats = diversity?.repeatMeals;
  const styleLabel = style === "easy" ? "省事" : "换花样";
  const kinds = showBreakfast
    ? `${breakfastCount} 种早餐、${mainsCount} 种正餐`
    : `${mainsCount} 种正餐`;
  return (
    <div className="text-base text-[var(--color-text)]">
      <p>
        当前篮可以组成 {kinds}。选择 {days}{" "}
        天后
        {repeats != null
          ? `预计有 ${repeats} 餐重复。`
          : "还不能排出餐单。"}
        {`（${styleLabel}）`}
      </p>
    </div>
  );
}

export function infeasibleCtaLabel(feedback: BasketFeedback): string {
  if (feedback.planPreview.feasible) return "只用这批货排餐";
  const slots = feedback.planPreview.blockedSlots
    .map((slot) => SLOT_LABEL[slot])
    .join("、");
  return `还差${slots || "餐位"}，见建议`;
}
