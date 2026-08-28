"use client";

import { Suspense, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { ingredients } from "@/domain/data";
import {
  effectiveExcludedIds,
  toggleExclusionFamily,
} from "@/domain/exclusionFamily";
import {
  computeTarget,
  DEFAULT_ABSENCE_POLICY,
  effectiveAbsencePolicy,
  enabledSlotsOf,
  MEAL_SLOTS,
  planSlotBudget,
  SLOT_KCAL_RATIO,
  validateCutPlanInputs,
} from "@/domain/nutrition";
import type {
  ActivityLevel,
  Allergen,
  Category,
  Equipment,
  Goal,
  MealSlot,
  Sex,
  SlotAbsence,
  UserProfile,
} from "@/domain/types";
import {
  ACTIVITY_HINT,
  ACTIVITY_LABEL,
  ALLERGEN_LABEL,
  CATEGORY_LABEL,
  EQUIPMENT_LABEL,
  GOAL_LABEL,
  ONBOARD_STEPS,
  SEX_LABEL,
  SLOT_LABEL,
  SLOT_PREP_LABEL,
} from "@/lib/labels";
import { useAppStore } from "@/store/useAppStore";

const SEXS: Sex[] = ["male", "female"];
const ACTIVITIES: ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
];
const GOALS: Goal[] = ["cut", "bulk", "maintain"];
const ALLERGENS: Allergen[] = [
  "egg",
  "milk",
  "peanut",
  "tree_nut",
  "soy",
  "gluten",
  "fish",
  "shellfish",
];
const EQUIPMENTS: Equipment[] = ["ricecooker", "airfryer", "microwave", "stove"];
const CATEGORIES: Category[] = ["protein", "carb", "veg", "fat", "seasoning"];

function toggleItem<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const other = new Set(b);
  return a.every((id) => other.has(id));
}

function Chip({
  selected,
  onClick,
  children,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      className="min-h-11 rounded-xl px-3 text-base"
      style={{
        background: selected ? "var(--color-brand)" : "var(--color-surface-2)",
        color: selected ? "#fff" : "var(--color-text)",
        opacity: disabled ? 0.65 : 1,
      }}
    >
      {children}
    </button>
  );
}

function sameEnabledSlots(a: MealSlot[], b: MealSlot[] | undefined): boolean {
  const bb = enabledSlotsOf({ enabledSlots: b } as UserProfile);
  return a.length === bb.length && a.every((slot, i) => slot === bb[i]);
}

function absencesChanged(
  next: Partial<Record<MealSlot, SlotAbsence>>,
  prev: UserProfile["slotAbsences"],
  enabled: MealSlot[],
): boolean {
  const enabledSet = new Set(enabled);
  for (const slot of MEAL_SLOTS) {
    if (enabledSet.has(slot)) continue;
    const a = next[slot] ?? { policy: DEFAULT_ABSENCE_POLICY[slot] };
    const b = prev?.[slot] ?? { policy: DEFAULT_ABSENCE_POLICY[slot] };
    if (a.policy !== b.policy) return true;
    const aK = a.awayKcal ?? null;
    const bK = b.awayKcal ?? null;
    if (aK !== bK) return true;
  }
  return false;
}

function buildSlotAbsences(
  enabled: MealSlot[],
  stored: Partial<Record<MealSlot, SlotAbsence>>,
  fullKcal: number | null,
): Partial<Record<MealSlot, SlotAbsence>> {
  const enabledSet = new Set(enabled);
  const out: Partial<Record<MealSlot, SlotAbsence>> = {};
  for (const slot of MEAL_SLOTS) {
    if (enabledSet.has(slot)) continue;
    const row = stored[slot] ?? { policy: DEFAULT_ABSENCE_POLICY[slot] };
    if (row.policy === "reserve") {
      const defaultAway =
        fullKcal != null ? Math.round(fullKcal * SLOT_KCAL_RATIO[slot]) : undefined;
      let away = row.awayKcal ?? defaultAway;
      if (enabled.length === 1 && (away == null || away === 0)) {
        away = defaultAway;
      }
      out[slot] = away != null ? { policy: "reserve", awayKcal: away } : { policy: "reserve" };
    } else {
      out[slot] = { policy: "fold" };
    }
  }
  return out;
}

function parseNum(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function validateBody(age: string, heightCm: string, weightKg: string): string[] {
  const errors: string[] = [];
  const a = parseNum(age);
  const h = parseNum(heightCm);
  const w = parseNum(weightKg);
  if (a == null || a < 14 || a > 80) errors.push("年龄需在 14–80 岁");
  if (h == null || h < 130 || h > 220) errors.push("身高需在 130–220 cm");
  if (w == null || w < 35 || w > 200) errors.push("体重需在 35–200 kg");
  return errors;
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <PageShell title="建档">
          <div className="h-40 animate-pulse rounded-2xl bg-[var(--color-surface-2)]" />
        </PageShell>
      }
    >
      <OnboardingReady />
    </Suspense>
  );
}

function OnboardingReady() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const existing = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const editing = searchParams.get("edit") === "1" && existing != null;

  const [wizardStep, setWizardStep] = useState(1);
  const [sex, setSex] = useState<Sex>(existing?.sex ?? "male");
  const [age, setAge] = useState(existing ? String(existing.age) : "");
  const [heightCm, setHeightCm] = useState(
    existing ? String(existing.heightCm) : "",
  );
  const [weightKg, setWeightKg] = useState(
    existing ? String(existing.weightKg) : "",
  );
  const [activity, setActivity] = useState<ActivityLevel>(
    existing?.activity ?? "moderate",
  );
  const [goal, setGoal] = useState<Goal>(existing?.goal ?? "maintain");
  const [targetWeightKg, setTargetWeightKg] = useState(
    existing?.targetWeightKg != null ? String(existing.targetWeightKg) : "",
  );
  const [targetWeeks, setTargetWeeks] = useState(
    existing?.targetWeeks != null ? String(existing.targetWeeks) : "",
  );
  const [allergens, setAllergens] = useState<Allergen[]>(
    existing?.allergens ?? [],
  );
  const [excludedIngredientIds, setExcludedIngredientIds] = useState<string[]>(
    existing?.excludedIngredientIds ?? [],
  );
  const [equipment, setEquipment] = useState<Equipment[]>(
    existing?.equipment?.length ? [...existing.equipment] : [...EQUIPMENTS],
  );
  const [enabledSlots, setEnabledSlots] = useState<MealSlot[]>(() =>
    existing ? enabledSlotsOf(existing) : [...MEAL_SLOTS],
  );
  const [slotAbsences, setSlotAbsences] = useState<
    Partial<Record<MealSlot, SlotAbsence>>
  >(() => ({ ...(existing?.slotAbsences ?? {}) }));
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const ageNum = parseNum(age);
  const showMinorWarning = ageNum != null && ageNum < 18;

  const draft: UserProfile | null = useMemo(() => {
    const a = parseNum(age);
    const h = parseNum(heightCm);
    const w = parseNum(weightKg);
    if (a == null || h == null || w == null) return null;
    const tw = parseNum(targetWeightKg);
    const weeks = parseNum(targetWeeks);
    const cutFields =
      goal === "cut" && tw != null && weeks != null
        ? { targetWeightKg: tw, targetWeeks: weeks }
        : {};
    const body: UserProfile = {
      sex,
      age: a,
      heightCm: h,
      weightKg: w,
      activity,
      goal,
      equipment,
      allergens,
      excludedIngredientIds,
      enabledSlots,
      ...cutFields,
    };
    const fullKcal = computeTarget(body).kcal;
    return {
      ...body,
      slotAbsences: buildSlotAbsences(enabledSlots, slotAbsences, fullKcal),
    };
  }, [
    sex,
    age,
    heightCm,
    weightKg,
    activity,
    goal,
    targetWeightKg,
    targetWeeks,
    equipment,
    allergens,
    excludedIngredientIds,
    enabledSlots,
    slotAbsences,
  ]);

  const target = draft ? computeTarget(draft) : null;

  function cutValidation() {
    const w = parseNum(weightKg);
    const h = parseNum(heightCm);
    if (goal !== "cut" || w == null || h == null) {
      return { errors: [] as string[], warnings: [] as string[] };
    }
    return validateCutPlanInputs({
      weightKg: w,
      heightCm: h,
      targetWeightKg: parseNum(targetWeightKg),
      targetWeeks: parseNum(targetWeeks),
    });
  }

  function goNext() {
    if (wizardStep === 1) {
      const nextErrors = validateBody(age, heightCm, weightKg);
      setErrors(nextErrors);
      setWarnings([]);
      if (nextErrors.length > 0) return;
    }
    if (wizardStep === 2 && goal === "cut") {
      const cut = cutValidation();
      setErrors(cut.errors);
      setWarnings(cut.warnings);
      if (cut.errors.length > 0) return;
    }
    setErrors([]);
    setWizardStep((s) => Math.min(5, s + 1));
  }

  function goBack() {
    setErrors([]);
    setWizardStep((s) => Math.max(1, s - 1));
  }

  function submit() {
    if (!draft) return;
    if (goal === "cut") {
      const cut = cutValidation();
      setErrors(cut.errors);
      setWarnings(cut.warnings);
      if (cut.errors.length > 0) return;
    }
    const saved: UserProfile =
      goal === "cut"
        ? draft
        : {
            ...draft,
            targetWeightKg: undefined,
            targetWeeks: undefined,
          };
    const slotChanged =
      editing &&
      existing != null &&
      (!sameEnabledSlots(enabledSlots, existing.enabledSlots) ||
        absencesChanged(saved.slotAbsences ?? {}, existing.slotAbsences, enabledSlots));
    const constraintsChanged =
      editing &&
      existing != null &&
      (!sameIdSet(equipment, existing.equipment) ||
        !sameIdSet(allergens, existing.allergens) ||
        !sameIdSet(excludedIngredientIds, existing.excludedIngredientIds) ||
        slotChanged);
    const bodyOrGoalChanged =
      editing &&
      existing != null &&
      (existing.sex !== saved.sex ||
        existing.age !== saved.age ||
        existing.heightCm !== saved.heightCm ||
        existing.weightKg !== saved.weightKg ||
        existing.activity !== saved.activity ||
        existing.goal !== saved.goal ||
        existing.targetWeightKg !== saved.targetWeightKg ||
        existing.targetWeeks !== saved.targetWeeks);
    let resetPlan = false;
    let recomputeMicro = false;
    if (constraintsChanged) {
      resetPlan = window.confirm(
        slotChanged
          ? "备哪几顿、厨具或忌口变了，当前餐单不能保证能做。清空餐单？"
          : "厨具或忌口变了，当前餐单不能保证能做。清空餐单？",
      );
    } else if (bodyOrGoalChanged) {
      recomputeMicro = window.confirm(
        "营养目标变了，按新目标重算微调？",
      );
    }
    setProfile(saved, { resetPlan, recomputeMicro });
    if (editing) {
      router.push("/");
      return;
    }
    router.push("/basket");
  }

  function toggleSlot(slot: MealSlot) {
    if (enabledSlots.includes(slot)) {
      if (enabledSlots.length === 1) return;
      setEnabledSlots(MEAL_SLOTS.filter((s) => s !== slot && enabledSlots.includes(s)));
      setSlotAbsences((prev) => ({
        ...prev,
        [slot]: prev[slot] ?? { policy: DEFAULT_ABSENCE_POLICY[slot] },
      }));
      return;
    }
    setEnabledSlots(MEAL_SLOTS.filter((s) => s === slot || enabledSlots.includes(s)));
    setSlotAbsences((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
  }

  const budget = draft && target ? planSlotBudget(target, draft) : null;

  return (
    <PageShell title={editing ? "编辑档案" : "建档"}>
      <p className="mb-2 text-sm text-[var(--color-text-2)]">约 2 分钟</p>
      <ol className="mb-4 grid w-full grid-cols-5 gap-1 text-[12px] leading-tight text-[var(--color-text-2)]">
        {ONBOARD_STEPS.map((label, i) => {
          const step = i + 1;
          const active = step === wizardStep;
          const done = step < wizardStep;
          return (
            <li
              key={label}
              className="min-w-0 rounded-xl px-0.5 py-2 text-center break-words"
              style={{
                background: active
                  ? "var(--color-brand)"
                  : done
                    ? "var(--color-surface-2)"
                    : "var(--color-surface)",
                color: active ? "#fff" : "var(--color-text-2)",
              }}
            >
              {step} {label}
            </li>
          );
        })}
      </ol>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (wizardStep === 5) submit();
          else goNext();
        }}
      >
        {wizardStep === 1 ? (
          <section className="space-y-3">
            <p className="text-sm text-[var(--color-text-2)]">性别 / 年龄 / 身高 / 体重</p>
            <div className="flex gap-2">
              {SEXS.map((item) => (
                <Chip key={item} selected={sex === item} onClick={() => setSex(item)}>
                  {SEX_LABEL[item]}
                </Chip>
              ))}
            </div>
            <label className="block text-sm text-[var(--color-text-2)]">
              年龄
              <input
                type="number"
                inputMode="numeric"
                min={14}
                max={80}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-base"
              />
            </label>
            {showMinorWarning ? (
              <p className="rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-warn)]">
                本工具不面向未成年人营养需求，结果仅供参考
              </p>
            ) : null}
            <label className="block text-sm text-[var(--color-text-2)]">
              身高（cm）
              <input
                type="number"
                inputMode="decimal"
                min={130}
                max={220}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-base"
              />
            </label>
            <label className="block text-sm text-[var(--color-text-2)]">
              体重（kg）
              <input
                type="number"
                inputMode="decimal"
                min={35}
                max={200}
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-base"
              />
            </label>
          </section>
        ) : null}

        {wizardStep === 2 ? (
          <section className="space-y-4">
            <div>
              <p className="mb-2 text-sm text-[var(--color-text-2)]">活动水平</p>
              <div className="space-y-2">
                {ACTIVITIES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setActivity(item)}
                    className={`w-full rounded-2xl border px-3 py-2 text-left ${
                      activity === item
                        ? "border-[var(--color-brand)] bg-[var(--color-surface-2)]"
                        : "border-[var(--color-line)] bg-[var(--color-surface)]"
                    }`}
                  >
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      {ACTIVITY_LABEL[item]}
                    </p>
                    <p className="text-xs text-[var(--color-text-2)]">{ACTIVITY_HINT[item]}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm text-[var(--color-text-2)]">目标</p>
              <div className="flex flex-wrap gap-2">
                {GOALS.map((item) => (
                  <Chip
                    key={item}
                    selected={goal === item}
                    onClick={() => {
                      setGoal(item);
                      if (item !== "cut") {
                        setTargetWeightKg("");
                        setTargetWeeks("");
                        return;
                      }
                      const w = parseNum(weightKg);
                      const h = parseNum(heightCm);
                      if (targetWeeks === "") setTargetWeeks("12");
                      if (targetWeightKg === "" && w != null && h != null) {
                        const raw = Math.round(w * 0.95);
                        const tw = raw >= w ? w - 1 : raw;
                        const check = validateCutPlanInputs({
                          weightKg: w,
                          heightCm: h,
                          targetWeightKg: tw,
                          targetWeeks: 12,
                        });
                        if (check.errors.length === 0) {
                          setTargetWeightKg(String(tw));
                        }
                      }
                    }}
                  >
                    {GOAL_LABEL[item]}
                  </Chip>
                ))}
              </div>
            </div>
            {goal === "cut" ? (
              <div className="space-y-3">
                <p className="text-sm text-[var(--color-text-2)]">减脂计划</p>
                <label className="block text-sm text-[var(--color-text-2)]">
                  目标体重（kg）<span className="text-[var(--color-warn)]"> 必填</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={35}
                    max={200}
                    value={targetWeightKg}
                    onChange={(e) => setTargetWeightKg(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-base"
                  />
                </label>
                <label className="block text-sm text-[var(--color-text-2)]">
                  计划周期（周）<span className="text-[var(--color-warn)]"> 必填</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={2}
                    max={52}
                    step={1}
                    value={targetWeeks}
                    onChange={(e) => setTargetWeeks(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-base"
                  />
                </label>
              </div>
            ) : null}
          </section>
        ) : null}

        {wizardStep === 3 ? (
          <section className="space-y-4">
            <div>
              <p className="mb-2 text-sm text-[var(--color-text-2)]">过敏原，有则必选</p>
              <p className="mb-2 text-xs text-[var(--color-text-3)]">
                按常见配方标，未化验；酱料未逐道拆。不是医疗建议。芝麻未列入。
              </p>
              <div className="flex flex-wrap gap-2">
                {ALLERGENS.map((item) => (
                  <Chip
                    key={item}
                    selected={allergens.includes(item)}
                    onClick={() => setAllergens((cur) => toggleItem(cur, item))}
                  >
                    {ALLERGEN_LABEL[item]}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm text-[var(--color-text-2)]">不吃的食材（可多选）</p>
              <p className="mb-2 text-xs text-[var(--color-text-3)]">
                勾鸡肉任一口，胸/腿/爪都会排除
              </p>
              <div className="max-h-72 space-y-3 overflow-y-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
                {CATEGORIES.map((cat) => (
                  <div key={cat}>
                    <p className="mb-1.5 text-xs text-[var(--color-text-3)]">
                      {CATEGORY_LABEL[cat]}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {ingredients
                        .filter((ing) => ing.category === cat)
                        .map((ing) => (
                          <Chip
                            key={ing.id}
                            selected={effectiveExcludedIds(
                              excludedIngredientIds,
                            ).includes(ing.id)}
                            onClick={() =>
                              setExcludedIngredientIds((cur) =>
                                toggleExclusionFamily(cur, ing.id),
                              )
                            }
                          >
                            {ing.name}
                          </Chip>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {wizardStep === 4 ? (
          <section className="space-y-3">
            <p className="text-sm text-[var(--color-text-2)]">
              请去掉没有的。一项都不选，午晚餐会排不出来。
            </p>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENTS.map((item) => (
                <Chip
                  key={item}
                  selected={equipment.includes(item)}
                  onClick={() => setEquipment((cur) => toggleItem(cur, item))}
                >
                  {EQUIPMENT_LABEL[item]}
                </Chip>
              ))}
            </div>
          </section>
        ) : null}

        {wizardStep === 5 && target && draft && budget ? (
          <section className="space-y-3">
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-[var(--color-text)]">
                这几天你备哪几顿
              </h2>
              <p className="text-sm text-[var(--color-text-2)]">
                至少选一顿。单位午饭或早餐不吃，都可以。
              </p>
              <div className="flex flex-wrap gap-2">
                {MEAL_SLOTS.map((slot) => {
                  const selected = enabledSlots.includes(slot);
                  return (
                    <Chip
                      key={slot}
                      selected={selected}
                      disabled={selected && enabledSlots.length === 1}
                      onClick={() => toggleSlot(slot)}
                    >
                      {SLOT_PREP_LABEL[slot]}
                    </Chip>
                  );
                })}
              </div>
              {enabledSlots.length >= 2 ? (
                <p className="text-xs text-[var(--color-text-2)]">
                  不吃：其他备的餐会吃满一天目标。在外：备的餐只覆盖自己那一顿。
                </p>
              ) : (
                <p className="text-xs text-[var(--color-text-2)]">
                  只备一顿时，不吃的那几顿不会并进这一顿——一顿家常菜到不了全天热量。
                </p>
              )}
              {MEAL_SLOTS.filter((slot) => !enabledSlots.includes(slot)).map(
                (slot) => {
                  const stored =
                    slotAbsences[slot]?.policy ?? DEFAULT_ABSENCE_POLICY[slot];
                  const defaultAway = Math.round(
                    target.kcal * SLOT_KCAL_RATIO[slot],
                  );
                  const minAway = enabledSlots.length === 1 ? defaultAway : 0;
                  const awayValue =
                    slotAbsences[slot]?.awayKcal ?? defaultAway;
                  return (
                    <div key={slot} className="space-y-2 rounded-2xl border border-[var(--color-line)] p-3">
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        {SLOT_LABEL[slot]}
                      </p>
                      <div
                        role="radiogroup"
                        aria-label={`${SLOT_LABEL[slot]}不备时`}
                        className="flex gap-3"
                      >
                        <label className="flex min-h-11 items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={`absence-${slot}`}
                            checked={stored === "fold"}
                            onChange={() =>
                              setSlotAbsences((prev) => ({
                                ...prev,
                                [slot]: { policy: "fold" },
                              }))
                            }
                          />
                          不吃
                        </label>
                        <label className="flex min-h-11 items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={`absence-${slot}`}
                            checked={stored === "reserve"}
                            onChange={() =>
                              setSlotAbsences((prev) => ({
                                ...prev,
                                [slot]: {
                                  policy: "reserve",
                                  awayKcal: defaultAway,
                                },
                              }))
                            }
                          />
                          在外面吃
                        </label>
                      </div>
                      {stored === "reserve" ? (
                        <label className="block text-sm text-[var(--color-text-2)]">
                          在外大约多少 kcal
                          <input
                            type="number"
                            inputMode="numeric"
                            min={minAway}
                            max={target.kcal}
                            value={awayValue}
                            onChange={(e) => {
                              const n = parseNum(e.target.value);
                              setSlotAbsences((prev) => ({
                                ...prev,
                                [slot]: {
                                  policy: "reserve",
                                  awayKcal: n ?? 0,
                                },
                              }));
                            }}
                            className="mt-1 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-base"
                          />
                        </label>
                      ) : null}
                    </div>
                  );
                },
              )}
            </div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">
              这是估算目标，不是处方
            </h2>
            {editing ? (
              <p className="text-sm text-[var(--color-text-2)]">
                营养目标已更新，下一次排出才按新目标微调。
              </p>
            ) : null}
            {target.clampedToFloor ? (
              <p className="rounded-xl bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-warn)]">
                已触发热量安全下限，建议咨询专业人士
                {goal === "cut"
                  ? " 按安全热量，实际周期会比你填的更长。"
                  : ""}
              </p>
            ) : null}
            <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
              <div className="grid grid-cols-4 gap-2 text-center">
                {(
                  [
                    ["热量", target.kcal, "kcal"],
                    ["蛋白", target.protein, "g"],
                    ["脂肪", target.fat, "g"],
                    ["碳水", target.carb, "g"],
                  ] as const
                ).map(([label, value, unit]) => (
                  <div key={label}>
                    <p className="text-[11px] text-[var(--color-text-2)]">{label}</p>
                    <p className="text-lg font-semibold text-[var(--color-brand)]">{value}</p>
                    <p className="text-[11px] text-[var(--color-text-3)]">{unit}</p>
                  </div>
                ))}
              </div>
              <ul className="mt-4 space-y-1.5 border-t border-[var(--color-line)] pt-3 text-sm text-[var(--color-text-2)]">
                {MEAL_SLOTS.map((slot) => {
                  const enabled = enabledSlots.includes(slot);
                  const policy = effectiveAbsencePolicy(draft, slot);
                  const defaultAway = Math.round(
                    target.kcal * SLOT_KCAL_RATIO[slot],
                  );
                  const awayKcal =
                    draft.slotAbsences?.[slot]?.awayKcal ?? defaultAway;
                  if (enabled) {
                    const kcal = Math.round(target.kcal * budget.ratios[slot]);
                    const pct = Math.round(budget.ratios[slot] * 100);
                    return (
                      <li key={slot} className="flex justify-between">
                        <span>
                          {SLOT_LABEL[slot]} 约 {pct}%
                        </span>
                        <span className="font-medium text-[var(--color-text)]">
                          {kcal} kcal
                        </span>
                      </li>
                    );
                  }
                  if (policy === "fold" && enabledSlots.length >= 2) {
                    return (
                      <li key={slot}>
                        {SLOT_LABEL[slot]}不吃，热量已并入其他备的餐
                      </li>
                    );
                  }
                  return (
                    <li key={slot}>
                      {SLOT_LABEL[slot]}在外约 {awayKcal} kcal，不并入备餐
                    </li>
                  );
                })}
              </ul>
              {goal === "cut" && target.dailyDeficit != null ? (
                <ul className="mt-3 space-y-1.5 border-t border-[var(--color-line)] pt-3 text-sm text-[var(--color-text-2)]">
                  <li className="flex justify-between gap-2">
                    <span>维持热量</span>
                    <span className="font-medium text-[var(--color-text)]">
                      {Math.round(target.tdee ?? 0)} kcal
                    </span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span>每日缺口</span>
                    <span className="font-medium text-[var(--color-text)]">
                      {Math.round(target.dailyDeficit)} kcal
                    </span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span>预计每周减重</span>
                    <span className="font-medium text-[var(--color-text)]">
                      {(target.weeklyLossKg ?? 0).toFixed(1)} kg
                    </span>
                  </li>
                </ul>
              ) : null}
            </div>
          </section>
        ) : null}

        {warnings.length > 0 ? (
          <ul className="space-y-1 text-xs text-[var(--color-warn)]" aria-live="polite">
            {warnings.map((warn) => (
              <li key={warn}>{warn}</li>
            ))}
          </ul>
        ) : null}
        {errors.length > 0 ? (
          <ul
            className="space-y-1 text-xs text-red-600"
            role="alert"
            aria-live="assertive"
          >
            {errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex gap-2 pt-2">
          {wizardStep > 1 ? (
            <button
              type="button"
              onClick={goBack}
              className="flex-1 rounded-full border border-[var(--color-line)] py-3 text-sm text-[var(--color-text-2)]"
            >
              上一步
            </button>
          ) : null}
          <button
            type="submit"
            className="flex-1 rounded-full bg-[var(--color-brand)] py-3 text-sm font-medium text-white"
          >
            {wizardStep === 4
              ? "查看目标"
              : wizardStep === 5
                ? editing
                  ? "保存档案"
                  : "去选菜"
                : "下一步"}
          </button>
        </div>
      </form>
    </PageShell>
  );
}
