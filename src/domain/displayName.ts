import type { Ingredient } from "./types";

const BRAND_PREFIX =
  /^(小象(?:烘焙)?|象大厨|圣农|海天|黄天鹅|蒙牛|燕塘|好想你|齐云山|亨氏|展艺|太太乐|李锦记|皇上皇|三全|双汇|伊利|雀巢|安佳|金龙鱼|胡姬花|粤盐|柴火大院|燕之坊|清净园|凤球唛|吉得利|味斯美|妙可蓝多|三岛|露莎?士|老板仔|汇营|云峰|圣方集|宗家府|王守义|莲花|百钻|安琪|舒可曼|三象牌|俞龙|合口味|壹号土牌)\s*/u;

export function shortName(name: string): string {
  let s = name;
  s = s.replace(/【[^】]*】/g, "");
  s = s.replace(/\([^)]*\)/g, "");
  s = s.replace(/（[^）]*）/g, "");
  s = s.replace(
    /\d+(\.\d+)?\s*-\s*\d+(\.\d+)?\s*(kg|g|ml|l|克)/gi,
    "",
  );
  s = s.replace(/\d+(\.\d+)?\s*(kg|g|ml|l|克)\s*\*\s*\d+\S*/gi, "");
  s = s.replace(/\d+(\.\d+)?\s*\*\s*\d+\S*/g, "");
  s = s.replace(/\d+\s*(枚|颗|粒装|只|条|粒)/g, "");
  s = s.replace(/约?\s*\d+(\.\d+)?\s*(kg|g|ml|l|克).*$/i, "");
  s = s.trim();
  s = s.replace(BRAND_PREFIX, "");
  for (;;) {
    const next = s.replace(/^(冷冻|冷鲜|进口|优质|冰鲜)\s*/u, "").trim();
    if (next === s) break;
    s = next;
  }
  s = s.trim();
  if (s.length >= 2 && s.length < name.length) return s;
  const fallback = name
    .replace(/【[^】]*】/g, "")
    .replace(/约?\s*\d+(\.\d+)?\s*(kg|g|ml|l)\b.*$/i, "")
    .trim();
  if (fallback.length >= 2 && fallback.length < name.length) return fallback;
  return name;
}

export function shortNameOf(ingredient: Ingredient): string {
  return shortName(ingredient.name);
}
