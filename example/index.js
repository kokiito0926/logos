// Logos complex-number runtime (generated because ∮ is used)
function C(x) { return typeof x === "number" ? { re: x, im: 0 } : x; }
function cre(z) { return C(z).re; }
function cim(z) { return C(z).im; }
function cabs(z) { z = C(z); return Math.hypot(z.re, z.im); }
function cconj(z) { z = C(z); return { re: z.re, im: -z.im }; }
function cadd(a, b) { a = C(a); b = C(b); return { re: a.re + b.re, im: a.im + b.im }; }
function csub(a, b) { a = C(a); b = C(b); return { re: a.re - b.re, im: a.im - b.im }; }
function cmul(a, b) { a = C(a); b = C(b); return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
function cdiv(a, b) { a = C(a); b = C(b); const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; }
function cneg(z) { z = C(z); return { re: -z.re, im: -z.im }; }
function cexp(z) { z = C(z); return { re: Math.exp(z.re) * Math.cos(z.im), im: Math.exp(z.re) * Math.sin(z.im) }; }
function clog(z) { z = C(z); return { re: Math.log(Math.hypot(z.re, z.im)), im: Math.atan2(z.im, z.re) }; }
function csqrt(z) { z = C(z); const r = Math.hypot(z.re, z.im); return { re: Math.sqrt((r + z.re) / 2), im: Math.sign(z.im || 1) * Math.sqrt((r - z.re) / 2) }; }
function csin(z) { z = C(z); return { re: Math.sin(z.re) * Math.cosh(z.im), im: Math.cos(z.re) * Math.sinh(z.im) }; }
function ccos(z) { z = C(z); return { re: Math.cos(z.re) * Math.cosh(z.im), im: -Math.sin(z.re) * Math.sinh(z.im) }; }
function ctan(z) { z = C(z); return cdiv(csin(z), ccos(z)); }
function cpow(a, b) { a = C(a); b = C(b); if (b.im === 0 && Number.isInteger(b.re)) { let r = { re: 1, im: 0 }; let base = a; let n = Math.abs(b.re); while (n > 0) { if (n % 2 === 1) r = cmul(r, base); base = cmul(base, base); n = Math.floor(n / 2); } return b.re < 0 ? cdiv(1, r) : r; } return cexp(cmul(b, clog(a))); }
function contour(f, n = 2000) {
    if (n % 2 !== 0) n++;
    const h = 1 / n;
    const twoPiI = { re: 0, im: 2 * Math.PI };
    let sum = null;
    for (let i = 0; i <= n; i++) {
        const t = i * h;
        const e = cexp({ re: 0, im: 2 * Math.PI * t });
        const dz = cmul(twoPiI, e);
        const w = cmul(f(e), dz);
        const coeff = i === 0 || i === n ? 1 : i % 2 === 0 ? 2 : 4;
        sum = sum === null ? cmul(coeff, w) : cadd(sum, cmul(coeff, w));
    }
    return cmul(sum, h / 3);
}
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
const total = (() => { let s = 0; let α = 0; while (!((α > 10))) { (s = (s + α)); (α = (α + 1)); } return s; })();
const residue = contour(α => (cdiv(1, α)));
const pole_out = contour(α => (cdiv(1, (csub(α, 2)))));