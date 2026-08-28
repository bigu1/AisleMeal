import { describe, expect, it } from "vitest";
import { ingredients, recipes } from "./data";
import { shortNameOf } from "./displayName";
import { householdHintFromSteps } from "./householdHint";

describe("householdHintFromSteps", () => {
  it("cook 入参：全麦面包步骤抽出约两片", () => {
    const bread = ingredients.find((item) => item.id === "wholewheat-bread");
    const recipe = recipes.find((item) => item.id === "pb-banana-toast");
    expect(bread && recipe).toBeTruthy();
    expect(shortNameOf(bread!)).toBe("全麦面包");
    expect(recipe!.steps.some((step) => step.includes("两片"))).toBe(true);
    expect(
      householdHintFromSteps(recipe!.steps, [shortNameOf(bread!), bread!.name]),
    ).toBe("约两片");
  });

  it("十一片不会收成一片", () => {
    const bread = ingredients.find((item) => item.id === "wholewheat-bread");
    expect(bread).toBeTruthy();
    expect(
      householdHintFromSteps(["十一片全麦面包铺开"], [
        shortNameOf(bread!),
        bread!.name,
      ]),
    ).toBe("约十一片");
  });

  it("步骤对不上食材名则不动", () => {
    expect(
      householdHintFromSteps(["两片全麦面包各抹一层花生酱"], ["鸡胸肉"]),
    ).toBeUndefined();
  });
});
