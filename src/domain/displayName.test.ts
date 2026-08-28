import { describe, expect, it } from "vitest";
import { ingredients } from "./data";
import { shortName, shortNameOf } from "./displayName";

describe("shortName", () => {
  it("通用短名仍含鸡胸；长品牌名能缩短", () => {
    const chicken = ingredients.find((item) => item.id === "chicken-breast");
    expect(chicken).toBeTruthy();
    expect(shortNameOf(chicken!)).toMatch(/鸡胸/);
    expect(shortName("【大海鲜】冰鲜东星斑1条600-700g")).toBe("东星斑");
    expect(shortName("小象富硒可生食鲜鸡蛋20枚1kg")).toMatch(/鸡蛋/);
    expect(shortName("小象富硒可生食鲜鸡蛋20枚1kg")).not.toMatch(/20枚/);
  });

  it("长包装名去掉区间、枚数和品牌前缀", () => {
    const egg = ingredients.find((item) => item.id === "egg");
    const feet = ingredients.find((item) => item.id === "chicken-feet");
    expect(egg && feet).toBeTruthy();
    expect(shortNameOf(egg!)).toMatch(/鸡蛋/);
    expect(shortNameOf(feet!)).toMatch(/鸡爪/);
    expect(shortName("优质冷鲜去趾鸡爪 400g")).toBe("去趾鸡爪");
    const milk = ingredients.find((item) => item.id === "whole-milk");
    expect(milk).toBeTruthy();
    expect(shortNameOf(milk!)).toMatch(/纯牛奶/);
    const cabbage = ingredients.find((item) => item.id === "baby-cabbage");
    const avocado = ingredients.find((item) => item.id === "avocado");
    const mayo = ingredients.find((item) => item.id === "light-mayo");
    expect(cabbage && avocado && mayo).toBeTruthy();
    expect(shortNameOf(cabbage!)).toMatch(/娃娃菜/);
    expect(shortNameOf(avocado!)).toMatch(/牛油果/);
    expect(shortName("亨氏蛋黄沙拉酱200克")).toMatch(/沙拉酱/);
  });
});
