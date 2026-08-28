const UNIT = "个|片|只|枚|根|颗|盒";
const CJK_NUM = "两|[一二三四五六七八九]|十[一二三四五六七八九]?";
const QTY_RE = new RegExp(`(\\d+|${CJK_NUM})\\s*(${UNIT})`, "g");

function needlesFrom(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string) => {
    const text = raw.trim();
    if (text.length < 2 || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  };
  for (const name of names) {
    add(name);
    const chunks = name.match(/[\u4e00-\u9fff]+/g) ?? [];
    for (const chunk of chunks) {
      add(chunk);
      if (chunk.length >= 4) add(chunk.slice(0, 2));
    }
  }
  out.sort((a, b) => b.length - a.length);
  return out;
}

function qtyNear(step: string, needle: string): string | undefined {
  let from = 0;
  while (from < step.length) {
    const at = step.indexOf(needle, from);
    if (at < 0) return undefined;
    const lo = Math.max(0, at - 8);
    const hi = Math.min(step.length, at + needle.length + 4);
    const window = step.slice(lo, hi);
    let best: { n: string; u: string; dist: number } | null = null;
    for (const match of window.matchAll(QTY_RE)) {
      const index = lo + (match.index ?? 0);
      const dist = Math.min(
        Math.abs(index - at),
        Math.abs(index + match[0].length - at),
      );
      if (!best || dist < best.dist) {
        best = { n: match[1], u: match[2], dist };
      }
    }
    if (best) return `约${best.n}${best.u}`;
    from = at + needle.length;
  }
  return undefined;
}

export function householdHintFromSteps(
  steps: readonly string[],
  names: readonly string[],
): string | undefined {
  const needles = needlesFrom(names);
  if (needles.length === 0) return undefined;
  for (const step of steps) {
    for (const needle of needles) {
      if (!step.includes(needle)) continue;
      const hint = qtyNear(step, needle);
      if (hint) return hint;
    }
  }
  return undefined;
}
