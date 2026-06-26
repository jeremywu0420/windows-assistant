// Pure helpers for the EE Quick Tools page. No DOM, no side effects.

// ---- Engineering notation -------------------------------------------------

const SI = [
  { p: 'T', e: 12 },
  { p: 'G', e: 9 },
  { p: 'M', e: 6 },
  { p: 'k', e: 3 },
  { p: '', e: 0 },
  { p: 'm', e: -3 },
  { p: 'µ', e: -6 },
  { p: 'n', e: -9 },
  { p: 'p', e: -12 },
];

const PREFIX_MAP = {
  t: 12,
  g: 9,
  meg: 6,
  k: 3,
  '': 0,
  m: -3,
  u: -6,
  µ: -6,
  n: -9,
  p: -12,
};

// Number -> "4.7 kΩ" style string.
export function formatEng(value, unit = '', sig = 4) {
  if (value === 0) return `0 ${unit}`.trim();
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  let chosen = SI[SI.length - 1];
  for (const s of SI) {
    if (abs >= Math.pow(10, s.e)) {
      chosen = s;
      break;
    }
  }
  const scaled = value / Math.pow(10, chosen.e);
  const rounded = parseFloat(scaled.toPrecision(sig));
  return `${rounded} ${chosen.p}${unit}`.trim();
}

// "4.7k", "10M", "2.2u" -> number. Plain numbers pass through.
export function parseEng(input) {
  if (typeof input === 'number') return input;
  if (input == null) return NaN;
  const raw = String(input).trim();
  if (raw === '') return NaN; // empty field is "not provided", not zero
  const s = raw.replace(/Ω|ohm[s]?|F|H|A|V|W/gi, '').trim();
  if (s === '') return NaN;
  const m = s.match(/^(-?\d*\.?\d+)\s*(meg|[tgmkµunp])?$/i);
  if (!m) return Number(s);
  const base = parseFloat(m[1]);
  const prefix = (m[2] || '').toLowerCase();
  const exp = PREFIX_MAP[prefix] ?? 0;
  return base * Math.pow(10, exp);
}

// ---- Ohm's law ------------------------------------------------------------

// Provide any two of { v, i, r, p }; returns all four (NaN if unsolvable).
export function ohmsLaw({ v, i, r, p }) {
  const has = (x) => Number.isFinite(x);
  let V = v;
  let I = i;
  let R = r;
  let P = p;

  if (has(v) && has(i)) {
    R = v / i;
    P = v * i;
  } else if (has(v) && has(r)) {
    I = v / r;
    P = (v * v) / r;
  } else if (has(v) && has(p)) {
    I = p / v;
    R = (v * v) / p;
  } else if (has(i) && has(r)) {
    V = i * r;
    P = i * i * r;
  } else if (has(i) && has(p)) {
    V = p / i;
    R = p / (i * i);
  } else if (has(r) && has(p)) {
    V = Math.sqrt(p * r);
    I = Math.sqrt(p / r);
  } else return { v: NaN, i: NaN, r: NaN, p: NaN };

  return { v: V, i: I, r: R, p: P };
}

// ---- Dividers & reactive --------------------------------------------------

export function voltageDivider({ vin, r1, r2 }) {
  const vout = vin * (r2 / (r1 + r2));
  return { vout };
}

// RC low-pass: tau = R*C, cutoff fc = 1/(2πRC)
export function rcFilter(r, c) {
  const tau = r * c;
  const fc = 1 / (2 * Math.PI * r * c);
  return { tau, fc };
}

// RL: tau = L/R, fc = R/(2πL)
export function rlFilter(r, l) {
  const tau = l / r;
  const fc = r / (2 * Math.PI * l);
  return { tau, fc };
}

// LC resonance: f = 1/(2π√(LC))
export function lcResonance(l, c) {
  const f = 1 / (2 * Math.PI * Math.sqrt(l * c));
  return { f };
}

// ---- Series / parallel ----------------------------------------------------

export function combineResistors(values, mode) {
  const v = values.filter((x) => Number.isFinite(x) && x > 0);
  if (v.length === 0) return NaN;
  if (mode === 'series') return v.reduce((a, b) => a + b, 0);
  return 1 / v.reduce((a, b) => a + 1 / b, 0); // parallel
}

// Capacitors combine oppositely to resistors.
export function combineCapacitors(values, mode) {
  const v = values.filter((x) => Number.isFinite(x) && x > 0);
  if (v.length === 0) return NaN;
  if (mode === 'parallel') return v.reduce((a, b) => a + b, 0);
  return 1 / v.reduce((a, b) => a + 1 / b, 0); // series
}

// ---- Resistor colour code -------------------------------------------------

export const RESISTOR_COLORS = [
  { name: 'black', label: '黑', digit: 0, mult: 1, css: '#1a1a1a' },
  { name: 'brown', label: '棕', digit: 1, mult: 1e1, tol: 1, css: '#7b3f00' },
  { name: 'red', label: '紅', digit: 2, mult: 1e2, tol: 2, css: '#d32f2f' },
  { name: 'orange', label: '橙', digit: 3, mult: 1e3, css: '#ef6c00' },
  { name: 'yellow', label: '黃', digit: 4, mult: 1e4, css: '#f9a825' },
  { name: 'green', label: '綠', digit: 5, mult: 1e5, tol: 0.5, css: '#2e7d32' },
  { name: 'blue', label: '藍', digit: 6, mult: 1e6, tol: 0.25, css: '#1565c0' },
  { name: 'violet', label: '紫', digit: 7, mult: 1e7, tol: 0.1, css: '#6a1b9a' },
  { name: 'grey', label: '灰', digit: 8, mult: 1e8, tol: 0.05, css: '#616161' },
  { name: 'white', label: '白', digit: 9, mult: 1e9, css: '#fafafa' },
  { name: 'gold', label: '金', mult: 0.1, tol: 5, css: '#c9a227' },
  { name: 'silver', label: '銀', mult: 0.01, tol: 10, css: '#9e9e9e' },
];

const byName = (n) => RESISTOR_COLORS.find((c) => c.name === n);

// bands: array of colour names. 4-band [d,d,mult,tol]; 5-band [d,d,d,mult,tol].
export function decodeResistorColors(bands) {
  if (!Array.isArray(bands) || (bands.length !== 4 && bands.length !== 5)) {
    return { ohms: NaN, tolerance: null };
  }
  const digitCount = bands.length === 5 ? 3 : 2;
  let digits = '';
  for (let k = 0; k < digitCount; k += 1) {
    const c = byName(bands[k]);
    if (!c || c.digit == null) return { ohms: NaN, tolerance: null };
    digits += String(c.digit);
  }
  const mult = byName(bands[digitCount]);
  const tol = byName(bands[digitCount + 1]);
  if (!mult || mult.mult == null) return { ohms: NaN, tolerance: null };
  const ohms = parseInt(digits, 10) * mult.mult;
  return { ohms, tolerance: tol && tol.tol != null ? tol.tol : null };
}

// Inverse: ohms -> colour band names. bandCount 4 (2 sig digits) or 5 (3 sig).
// Returns { bands, value, exact } or null. `bands` are digit+multiplier names
// (tolerance is chosen separately); `value` is what those bands decode back to.
export function encodeResistorValue(ohms, bandCount = 4) {
  if (!Number.isFinite(ohms) || ohms <= 0) return null;
  const sig = bandCount === 5 ? 3 : 2;
  let exp = Math.floor(Math.log10(ohms)) - (sig - 1);
  let d = Math.round(ohms / Math.pow(10, exp));
  if (d >= Math.pow(10, sig)) {
    d = Math.round(d / 10);
    exp += 1;
  } // rounding carry
  if (d < Math.pow(10, sig - 1)) {
    d *= 10;
    exp -= 1;
  } // keep leading digit non-zero
  // Multiplier band must be one of the available colours (10^-2 .. 10^9).
  const mult = RESISTOR_COLORS.find(
    (c) => c.mult != null && Math.abs(c.mult - Math.pow(10, exp)) < 1e-15,
  );
  if (!mult) return null;
  const digitStr = String(d).padStart(sig, '0');
  const bands = [];
  for (const ch of digitStr) {
    const c = RESISTOR_COLORS.find((x) => x.digit === Number(ch));
    if (!c) return null;
    bands.push(c.name);
  }
  bands.push(mult.name);
  const value = d * Math.pow(10, exp);
  return { bands, value, exact: Math.abs(value - ohms) < 1e-9 };
}

// ---- Base conversion ------------------------------------------------------

// Parse an integer string in a given base; returns NaN if invalid.
export function parseInBase(str, base) {
  if (str == null) return NaN;
  const s = String(str)
    .trim()
    .replace(/^0[xbo]/i, '');
  if (s === '') return NaN;
  if (!/^[0-9a-fA-F]+$/.test(s)) return NaN;
  const n = parseInt(s, base);
  if (Number.isNaN(n)) return NaN;
  // Reject digits outside the base (parseInt is lenient).
  if (n.toString(base).toLowerCase() !== s.toLowerCase().replace(/^0+(?=.)/, '')) return NaN;
  return n;
}

export function toBases(n) {
  if (!Number.isFinite(n)) return { bin: '', oct: '', dec: '', hex: '' };
  return {
    bin: n.toString(2),
    oct: n.toString(8),
    dec: n.toString(10),
    hex: n.toString(16).toUpperCase(),
  };
}
