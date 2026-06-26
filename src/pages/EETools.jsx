import React, { useMemo, useState } from 'react';
import '../styles/ee-tools.css';
import {
  ohmsLaw,
  voltageDivider,
  rcFilter,
  rlFilter,
  lcResonance,
  combineResistors,
  combineCapacitors,
  decodeResistorColors,
  encodeResistorValue,
  formatEng,
  parseEng,
  RESISTOR_COLORS,
  parseInBase,
  toBases,
} from '../utils/eeMath.js';

function Field({ label, value, onChange, placeholder }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="ee-label">{label}</span>
      <input
        className="ee-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="text"
      />
    </label>
  );
}

function Row({ children }) {
  return <div className="ee-row">{children}</div>;
}

function ToolCard({ icon, title, hint, children }) {
  return (
    <div className="ee-card">
      <div className="ee-card-head">
        <span className="ee-ico" aria-hidden="true">
          {icon}
        </span>
        <span className="ee-card-title">{title}</span>
      </div>
      {hint ? <p className="ee-hint">{hint}</p> : null}
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <p className="ee-empty">{children}</p>;
}

const Val = ({ children }) => <span className="ee-val">{children}</span>;
const K = ({ children }) => <span className="k">{children}</span>;

// ---- Ohm's law ----
function OhmsLaw() {
  const [f, setF] = useState({ v: '', i: '', r: '', p: '' });
  const nums = { v: parseEng(f.v), i: parseEng(f.i), r: parseEng(f.r), p: parseEng(f.p) };
  const filled = Object.entries(nums).filter(([, x]) => Number.isFinite(x));
  const res = filled.length >= 2 ? ohmsLaw(nums) : null;
  const valid = res && Number.isFinite(res.v) && Number.isFinite(res.i);

  return (
    <ToolCard
      icon="Ω"
      title="歐姆定律"
      hint="填入任意兩個值，自動算出其餘。可用工程記號（例：1k、4.7m）。"
    >
      <Row>
        <Field
          label="電壓 V (V)"
          value={f.v}
          onChange={(v) => setF({ ...f, v })}
          placeholder="例 5"
        />
        <Field
          label="電流 I (A)"
          value={f.i}
          onChange={(v) => setF({ ...f, i: v })}
          placeholder="例 5m"
        />
      </Row>
      <Row>
        <Field
          label="電阻 R (Ω)"
          value={f.r}
          onChange={(v) => setF({ ...f, r: v })}
          placeholder="例 1k"
        />
        <Field
          label="功率 P (W)"
          value={f.p}
          onChange={(v) => setF({ ...f, p: v })}
          placeholder="例 25m"
        />
      </Row>
      {valid ? (
        <div className="ee-readout">
          <div>
            <K>V</K> = <Val>{formatEng(res.v, 'V')}</Val>
          </div>
          <div>
            <K>I</K> = <Val>{formatEng(res.i, 'A')}</Val>
          </div>
          <div>
            <K>R</K> = <Val>{formatEng(res.r, 'Ω')}</Val>
          </div>
          <div>
            <K>P</K> = <Val>{formatEng(res.p, 'W')}</Val>
          </div>
        </div>
      ) : (
        <Empty>輸入兩個值以計算。</Empty>
      )}
    </ToolCard>
  );
}

// ---- Voltage divider ----
function VoltageDivider() {
  const [f, setF] = useState({ vin: '', r1: '', r2: '' });
  const vin = parseEng(f.vin);
  const r1 = parseEng(f.r1);
  const r2 = parseEng(f.r2);
  const ok = [vin, r1, r2].every(Number.isFinite) && r1 + r2 > 0;
  const out = ok ? voltageDivider({ vin, r1, r2 }).vout : null;
  return (
    <ToolCard icon="÷" title="分壓器" hint="Vout = Vin × R2 / (R1 + R2)">
      <Row>
        <Field
          label="Vin (V)"
          value={f.vin}
          onChange={(v) => setF({ ...f, vin: v })}
          placeholder="例 9"
        />
        <div />
      </Row>
      <Row>
        <Field
          label="R1 (Ω)"
          value={f.r1}
          onChange={(v) => setF({ ...f, r1: v })}
          placeholder="例 1k"
        />
        <Field
          label="R2 (Ω)"
          value={f.r2}
          onChange={(v) => setF({ ...f, r2: v })}
          placeholder="例 2k"
        />
      </Row>
      {ok ? (
        <div className="ee-readout">
          <K>Vout</K> = <Val>{formatEng(out, 'V')}</Val>
        </div>
      ) : (
        <Empty>輸入 Vin、R1、R2。</Empty>
      )}
    </ToolCard>
  );
}

// ---- Resistor colour code ----
const DIGIT_COLORS = RESISTOR_COLORS.filter((c) => c.digit != null);
const MULT_COLORS = RESISTOR_COLORS.filter((c) => c.mult != null);
const TOL_COLORS = RESISTOR_COLORS.filter((c) => c.tol != null);

function Swatch({ css }) {
  return <span className="ee-swatch" style={{ background: css }} />;
}

function ColorSelect({ label, options, value, onChange }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="ee-label">{label}</span>
      <select className="ee-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((c) => (
          <option key={c.name} value={c.name}>
            {c.label} {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function DecodeMode() {
  const [bands, setBands] = useState(['brown', 'black', 'red', 'gold']);
  const set = (idx, v) => {
    const next = [...bands];
    next[idx] = v;
    setBands(next);
  };
  const { ohms, tolerance } = decodeResistorColors(bands);
  const swatches = bands.map((n) => RESISTOR_COLORS.find((c) => c.name === n));
  return (
    <>
      <div className="ee-swatches">
        {swatches.map((c, idx) => (
          <Swatch key={idx} css={c?.css || '#888'} />
        ))}
      </div>
      <Row>
        <ColorSelect
          label="第 1 環"
          options={DIGIT_COLORS}
          value={bands[0]}
          onChange={(v) => set(0, v)}
        />
        <ColorSelect
          label="第 2 環"
          options={DIGIT_COLORS}
          value={bands[1]}
          onChange={(v) => set(1, v)}
        />
      </Row>
      <Row>
        <ColorSelect
          label="倍率"
          options={MULT_COLORS}
          value={bands[2]}
          onChange={(v) => set(2, v)}
        />
        <ColorSelect
          label="誤差"
          options={TOL_COLORS}
          value={bands[3]}
          onChange={(v) => set(3, v)}
        />
      </Row>
      {Number.isFinite(ohms) ? (
        <div className="ee-readout">
          <K>阻值</K> = <Val>{formatEng(ohms, 'Ω')}</Val>
          {tolerance != null ? <span className="ee-note"> ± {tolerance}%</span> : null}
        </div>
      ) : null}
    </>
  );
}

function EncodeMode() {
  const [text, setText] = useState('4.7k');
  const [count, setCount] = useState(4);
  const ohms = parseEng(text);
  const enc = encodeResistorValue(ohms, count);
  return (
    <>
      <Row>
        <Field label="阻值 (Ω)" value={text} onChange={setText} placeholder="例 4.7k" />
        <label style={{ display: 'block' }}>
          <span className="ee-label">環數</span>
          <select
            className="ee-input"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            <option value={4}>4 環</option>
            <option value={5}>5 環</option>
          </select>
        </label>
      </Row>
      {enc ? (
        <div className="ee-readout">
          <div className="ee-swatches">
            {enc.bands.map((n, idx) => {
              const c = RESISTOR_COLORS.find((x) => x.name === n);
              return <Swatch key={idx} css={c?.css || '#888'} />;
            })}
          </div>
          {enc.bands.map((n, idx) => {
            const c = RESISTOR_COLORS.find((x) => x.name === n);
            const role = idx < enc.bands.length - 1 ? `第 ${idx + 1} 位` : '倍率';
            return (
              <div key={idx}>
                <K>{role}</K>{' '}
                <strong>
                  {c?.label} {n}
                </strong>
              </div>
            );
          })}
          <div style={{ marginTop: 4 }}>
            <K>回推值</K> = <Val>{formatEng(enc.value, 'Ω')}</Val>
            <span className="ee-note"> {enc.exact ? '（精確）' : '（最接近）'}</span>
          </div>
        </div>
      ) : (
        <Empty>輸入一個有效阻值（例 4.7k）。</Empty>
      )}
    </>
  );
}

function ResistorColorCode() {
  const [mode, setMode] = useState('decode');
  return (
    <ToolCard icon="R" title="電阻色碼">
      <div className="ee-seg">
        <button
          type="button"
          className={mode === 'decode' ? 'on' : ''}
          onClick={() => setMode('decode')}
        >
          色碼 → 阻值
        </button>
        <button
          type="button"
          className={mode === 'encode' ? 'on' : ''}
          onClick={() => setMode('encode')}
        >
          阻值 → 色碼
        </button>
      </div>
      {mode === 'decode' ? <DecodeMode /> : <EncodeMode />}
    </ToolCard>
  );
}

// ---- Reactive: RC / RL / LC ----
function Reactive() {
  const [f, setF] = useState({ r: '', c: '', l: '' });
  const r = parseEng(f.r);
  const c = parseEng(f.c);
  const l = parseEng(f.l);
  const rc = Number.isFinite(r) && Number.isFinite(c) ? rcFilter(r, c) : null;
  const rl = Number.isFinite(r) && Number.isFinite(l) ? rlFilter(r, l) : null;
  const lc = Number.isFinite(l) && Number.isFinite(c) ? lcResonance(l, c) : null;
  return (
    <ToolCard icon="∿" title="RC / RL / LC" hint="輸入需要的數值；對應的結果會出現。">
      <Row>
        <Field
          label="R (Ω)"
          value={f.r}
          onChange={(v) => setF({ ...f, r: v })}
          placeholder="例 1k"
        />
        <Field
          label="C (F)"
          value={f.c}
          onChange={(v) => setF({ ...f, c: v })}
          placeholder="例 1u"
        />
      </Row>
      <Row>
        <Field
          label="L (H)"
          value={f.l}
          onChange={(v) => setF({ ...f, l: v })}
          placeholder="例 1m"
        />
        <div />
      </Row>
      {rc || rl || lc ? (
        <div className="ee-readout">
          {rc ? (
            <div>
              <K>RC</K> τ = <Val>{formatEng(rc.tau, 's')}</Val>，fc ={' '}
              <Val>{formatEng(rc.fc, 'Hz')}</Val>
            </div>
          ) : null}
          {rl ? (
            <div>
              <K>RL</K> τ = <Val>{formatEng(rl.tau, 's')}</Val>，fc ={' '}
              <Val>{formatEng(rl.fc, 'Hz')}</Val>
            </div>
          ) : null}
          {lc ? (
            <div>
              <K>LC</K> f = <Val>{formatEng(lc.f, 'Hz')}</Val>
            </div>
          ) : null}
        </div>
      ) : (
        <Empty>輸入 R+C、R+L 或 L+C。</Empty>
      )}
    </ToolCard>
  );
}

// ---- Series / parallel ----
function SeriesParallel() {
  const [kind, setKind] = useState('R'); // R or C
  const [text, setText] = useState('');
  const values = text
    .split(/[\s,]+/)
    .map((s) => parseEng(s))
    .filter((x) => Number.isFinite(x) && x > 0);
  const isR = kind === 'R';
  const series = isR ? combineResistors(values, 'series') : combineCapacitors(values, 'series');
  const parallel = isR
    ? combineResistors(values, 'parallel')
    : combineCapacitors(values, 'parallel');
  const unit = isR ? 'Ω' : 'F';
  return (
    <ToolCard icon="≣" title="串聯 / 並聯">
      <div className="ee-seg">
        <button type="button" className={isR ? 'on' : ''} onClick={() => setKind('R')}>
          電阻 R
        </button>
        <button type="button" className={!isR ? 'on' : ''} onClick={() => setKind('C')}>
          電容 C
        </button>
      </div>
      <Field
        label={`輸入多個${isR ? '電阻' : '電容'}值（用空白或逗號分隔）`}
        value={text}
        onChange={setText}
        placeholder={isR ? '例 1k, 2k, 3k' : '例 1u, 2.2u'}
      />
      {values.length >= 1 ? (
        <div className="ee-readout">
          <div>
            <K>串聯</K> = <Val>{formatEng(series, unit)}</Val>
          </div>
          <div>
            <K>並聯</K> = <Val>{formatEng(parallel, unit)}</Val>
          </div>
          <div className="ee-note">{values.length} 個元件</div>
        </div>
      ) : (
        <Empty>輸入至少一個值。</Empty>
      )}
    </ToolCard>
  );
}

// ---- Base converter ----
function BaseConverter() {
  const [val, setVal] = useState('');
  const [base, setBase] = useState(10);
  const n = parseInBase(val, base);
  const out = toBases(n);
  const ok = Number.isFinite(n);
  return (
    <ToolCard icon="0x" title="進位轉換">
      <Row>
        <Field label="數值" value={val} onChange={setVal} placeholder="例 255 / FF / 1010" />
        <label style={{ display: 'block' }}>
          <span className="ee-label">輸入進位</span>
          <select
            className="ee-input"
            value={base}
            onChange={(e) => setBase(Number(e.target.value))}
          >
            <option value={2}>二進位 (BIN)</option>
            <option value={8}>八進位 (OCT)</option>
            <option value={10}>十進位 (DEC)</option>
            <option value={16}>十六進位 (HEX)</option>
          </select>
        </label>
      </Row>
      {ok ? (
        <div className="ee-readout">
          <div>
            <K>BIN</K> = <Val>{out.bin}</Val>
          </div>
          <div>
            <K>OCT</K> = <Val>{out.oct}</Val>
          </div>
          <div>
            <K>DEC</K> = <Val>{out.dec}</Val>
          </div>
          <div>
            <K>HEX</K> = <Val>{out.hex}</Val>
          </div>
        </div>
      ) : (
        <Empty>輸入一個有效數值。</Empty>
      )}
    </ToolCard>
  );
}

function CircuitBackground() {
  return (
    <svg className="ee-circuit" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="ee-cir" width="240" height="240" patternUnits="userSpaceOnUse">
          <g
            fill="none"
            stroke="#2563eb"
            strokeOpacity="0.16"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M0 46 H64 V104 H140 V20" />
            <path d="M140 104 H202 V176" />
            <path d="M48 240 V182 H112" />
            <path d="M0 192 H30 V132 H92" />
            <path d="M182 240 V196 H232" />
            <path d="M202 24 H240" />
            <path d="M92 132 V92" />
          </g>
          <g fill="#13d6c0" fillOpacity="0.28">
            <circle cx="140" cy="104" r="3.4" />
            <circle cx="64" cy="46" r="2.6" />
            <circle cx="202" cy="176" r="3" />
            <circle cx="112" cy="182" r="2.6" />
            <circle cx="92" cy="132" r="2.6" />
            <circle cx="182" cy="196" r="2.6" />
            <circle cx="30" cy="192" r="2.4" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#ee-cir)" />
    </svg>
  );
}

function Particles() {
  const dots = useMemo(
    () =>
      Array.from({ length: 22 }, () => {
        const size = 2 + Math.round(Math.random() * 3);
        return {
          left: Math.round(Math.random() * 100),
          top: Math.round(Math.random() * 100),
          size,
          dur: 8 + Math.round(Math.random() * 10),
          delay: -Math.round(Math.random() * 14),
        };
      }),
    [],
  );
  return (
    <div className="ee-particles">
      {dots.map((d, i) => (
        <i
          key={i}
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            animationDuration: `${d.dur}s`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function EETools() {
  const tools = useMemo(
    () => [
      <OhmsLaw key="ohm" />,
      <VoltageDivider key="vdiv" />,
      <ResistorColorCode key="res" />,
      <Reactive key="rc" />,
      <SeriesParallel key="sp" />,
      <BaseConverter key="base" />,
    ],
    [],
  );
  return (
    <div className="ee-tech">
      <div className="ee-bg" aria-hidden="true">
        <CircuitBackground />
        <Particles />
      </div>
      <div className="ee-hero">
        <span className="ee-kicker">Toolbox</span>
        <h1 className="ee-title">EE 工具</h1>
        <p className="ee-sub">
          電機常用快速計算：歐姆定律、分壓、電阻色碼、RC/RL/LC、串並聯與進位轉換。輸入支援工程記號（k、m、u、n…）。
        </p>
      </div>
      <div className="ee-grid2">{tools}</div>
    </div>
  );
}
