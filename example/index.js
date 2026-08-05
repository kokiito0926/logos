const square = α => (α ** 2);
const distance = (α, β) => Math.sqrt((((α.x - β.x) ** 2) + ((α.y - β.y) ** 2)));
const add = (α, β) => (α + β);
const multiply = (α, β) => (α * β);
const in_set = α => (set.has(α));
const range1to10 = range(1, 10);
const exclusive_range = range(0, n, true);
const abs = α => {
    return ((α >= 0) ? α : (-α));
};
const adult = ((age >= 18) ? 1 : 0);
const n = (() => { let α = 0; while (!(((α ** 2) >= 100))) α++; return α; })();