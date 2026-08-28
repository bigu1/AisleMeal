export function cookingVideoSearchUrl(recipeName: string): string {
  const query = encodeURIComponent(`${recipeName} 做法`);
  return `https://search.bilibili.com/all?keyword=${query}`;
}
