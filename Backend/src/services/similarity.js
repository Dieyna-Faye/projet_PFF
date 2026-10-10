function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .sort();
}

function similarity(textA, textB) {
  const a = normalize(textA);
  const b = normalize(textB);
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : Math.round((inter / union) * 100) / 100;
}

module.exports = { similarity };
