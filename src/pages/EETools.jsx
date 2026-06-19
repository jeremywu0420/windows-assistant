import React, { useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import Card from '../components/Card.jsx';
import {
  ohmsLaw, voltageDivider, rcFilter, rlFilter, lcResonance,
  combineResistors, combineCapacitors, decodeResistorColors,
  formatEng, parseEng, RESISTOR_COLORS, parseInBase, toBases,
} from '../utils/eeMath.js';

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px',
  border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)',
  color: 'var(--text)', fontFamily: '"Cascadia Code","Consolas",monospace',
};
const labelStyle = { fontSize: 12, color: 'var(--text-muted, #888)', marginBottom: 4, display: 'block' };
const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 16 };
const outStyle = { fontFamily: '"Cascadia Code","Consolas",monospace', fontWeight: 600 };

function Field({ label, value, onChange, placeholder }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={labelStyle}>{label}</span>
      <input
        style={inputStyle}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="text"
      />
    </label>
  );
}

function Row({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>{children}</div>;
}

// ---- Ohm's law ----
function OhmsLaw() {
  const [f, setF] = useState({ v: '', i: '', r: '', p: '' });
  const nums = { v: parseEng(f.v), i: parseEng(f.i), r: parseEng(f.r), p: parseEng(f.p) };
  const filled = Object.entries(nums).filter(([, x]) => Number.isFinite(x));
  const res = filled.length >= 2 ? ohmsLaw(nums) : null;
  const valid = res && Number.isFinite(res.v) && Number.isFinite(res.i);

  return (
    <Card title="歐姆定律" icon="Ω">
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>填入任意兩個值，自動算出其餘。可用工程記號（例：1k、4.7m）。</p>
      <Row>
        <Field label="電壓 V (V)" value={f.v} onChange={(v) => setF({ ...f, v })} placeholder="例 5" />
        <Field label="電流 I (A)" value={f.i} onChange={(v) => setF({ ...f, i: v })} placeholder="例 5m" />
      </Row>
      <Row>
        <Field label="電阻 R (Ω)" value={f.r} onChange={(v) => setF({ ...f, r: v })} placeholder="例 1k" />
        <Field label="功率 P (W)" value={f.p} onChange={(v) => setF({ ...f, p: v })} placeholder="例 25m" />
      </Row>
      {valid ? (
        <div style={{ marginTop: 10, lineHeight: 1.9 }}>
          <div>V = <span style={outStyle}>{formatEng(res.v, 'V')}</span></div>
          <div>I = <span style={outStyle}>{formatEng(res.i, 'A')}</span></div>
          <div>R = <span style={outStyle}>{formatEng(res.r, 'Ω')}</span></div>
          <div>P = <span style={outStyle}>{formatEng(res.p, 'W')}</span></div>
        </div>
      ) : <p className="muted" style={{ fontSize: 12 }}>輸入兩個值以計算。</p>}
    </Card>
  );
}

// ---- Voltage divider ----
function VoltageDivider() {
  const [f, setF] = useState({ vin: '', r1: '', r2: '' });
  const vin = parseEng(f.vin); const r1 = parseEng(f.r1); const r2 = parseEng(f.r2);
  const ok = [vin, r1, r2].every(Number.isFinite) && r1 + r2 > 0;
  const out = ok ? voltageDivider({ vin, r1, r2 }).vout : null;
  return (
    <Card title="分壓器" icon="÷">
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Vout = Vin × R2 / (R1 + R2)</p>
      <Row>
        <Field label="Vin (V)" value={f.vin} onChange={(v) => setF({ ...f, vin: v })} placeholder="例 9" />
        <div />
      </Row>
      <Row>
        <Field label="R1 (Ω)" value={f.r1} onChange={(v) => setF({ ...f, r1: v })} placeholder="例 1k" />
        <Field label="R2 (Ω)" value={f.r2} onChange={(v) => setF({ ...f, r2: v })} placeholder="例 2k" />
      </Row>
      {ok ? <div style={{ marginTop: 6 }}>Vout = <span style={outStyle}>{formatEng(out, 'V')}</span></div>
        : <p className="muted" style={{ fontSize: 12 }}>輸入 Vin、R1、R2。</p>}
    </Card>
  );
}

// ---- Resistor colour code ----
const DIGIT_COLORS = RESISTOR_COLORS.filter((c) => c.digit != null);
const MULT_COLORS = RESISTOR_COLORS.filter((c) => c.mult != null);
const TOL_COLORS = RESISTOR_COLORS.filter((c) => c.tol != null);

function Swatch({ css }) {
  return <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: css, border: '1px solid var(--border)', marginRight: 6, verticalAlign: 'middle' }} />;
}

function ColorSelect({ label, options, value, onChange }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={labelStyle}>{label}</span>
      <select style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((c) => <option key={c.name} value={c.name}>{c.label} {c.name}</option>)}
      </select>
    </label>
  );
}

function ResistorColorCode() {
  const [bands, setBands] = useState(['brown', 'black', 'red', 'gold']);
  const set = (idx, v) => { const next = [...bands]; next[idx] = v; setBands(next); };
  const { ohms, tolerance } = decodeResistorColors(bands);
  const swatches = bands.map((n) => RESISTOR_COLORS.find((c) => c.name === n));
  return (
    <Card title="電阻色碼（4 環）" icon="🎨">
      <div style={{ marginBottom: 10 }}>
        {swatches.map((c, idx) => <Swatch key={idx} css={c?.css || '#888'} />)}
      </div>
      <Row>
        <ColorSelect label="第 1 環" options={DIGIT_COLORS} value={bands[0]} onChange={(v) => set(0, v)} />
        <ColorSelect label="第 2 環" options={DIGIT_COLORS} value={bands[1]} onChange={(v) => set(1, v)} />
      </Row>
      <Row>
        <ColorSelect label="倍率" options={MULT_COLORS} value={bands[2]} onChange={(v) => set(2, v)} />
        <ColorSelect label="誤差" options={TOL_COLORS} value={bands[3]} onChange={(v) => set(3, v)} />
      </Row>
      {Number.isFinite(ohms) ? (
        <div style={{ marginTop: 6 }}>
          阻值 = <span style={outStyle}>{formatEng(ohms, 'Ω')}</span>
          {tolerance != null ? <span className="muted"> ± {tolerance}%</span> : null}
        </div>
      ) : null}
    </Card>
  );
}

// ---- Reactive: RC / RL / LC ----
function Reactive() {
  const [f, setF] = useState({ r: '', c: '', l: '' });
  const r = parseEng(f.r); const c = parseEng(f.c); const l = parseEng(f.l);
  const rc = Number.isFinite(r) && Number.isFinite(c) ? rcFilter(r, c) : null;
  const rl = Number.isFinite(r) && Number.isFinite(l) ? rlFilter(r, l) : null;
  const lc = Number.isFinite(l) && Number.isFinite(c) ? lcResonance(l, c) : null;
  return (
    <Card title="RC / RL / LC" icon="〜">
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>輸入需要的數值；對應的結果會出現。</p>
      <Row>
        <Field label="R (Ω)" value={f.r} onChange={(v) => setF({ ...f, r: v })} placeholder="例 1k" />
        <Field label="C (F)" value={f.c} onChange={(v) => setF({ ...f, c: v })} placeholder="例 1u" />
      </Row>
      <Row>
        <Field label="L (H)" value={f.l} onChange={(v) => setF({ ...f, l: v })} placeholder="例 1m" />
        <div />
      </Row>
      <div style={{ lineHeight: 1.9 }}>
        {rc ? <div>RC：τ = <span style={outStyle}>{formatEng(rc.tau, 's')}</span>，fc = <span style={outStyle}>{formatEng(rc.fc, 'Hz')}</span></div> : null}
        {rl ? <div>RL：τ = <span style={outStyle}>{formatEng(rl.tau, 's')}</span>，fc = <span style={outStyle}>{formatEng(rl.fc, 'Hz')}</span></div> : null}
        {lc ? <div>LC 諧振：f = <span style={outStyle}>{formatEng(lc.f, 'Hz')}</span></div> : null}
        {!rc && !rl && !lc ? <p className="muted" style={{ fontSize: 12 }}>輸入 R+C、R+L 或 L+C。</p> : null}
      </div>
    </Card>
  );
}

// ---- Series / parallel ----
function SeriesParallel() {
  const [kind, setKind] = useState('R'); // R or C
  const [text, setText] = useState('');
  const values = text.split(/[\s,]+/).map((s) => parseEng(s)).filter((x) => Number.isFinite(x) && x > 0);
  const isR = kind === 'R';
  const series = isR ? combineResistors(values, 'series') : combineCapacitors(values, 'series');
  const parallel = isR ? combineResistors(values, 'parallel') : combineCapacitors(values, 'parallel');
  const unit = isR ? 'Ω' : 'F';
  return (
    <Card title="串聯 / 並聯" icon="≣">
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button type="button" className={`filter-chip ${isR ? 'active' : ''}`} onClick={() => setKind('R')}>電阻 R</button>
        <button type="button" className={`filter-chip ${!isR ? 'active' : ''}`} onClick={() => setKind('C')}>電容 C</button>
      </div>
      <Field
        label={`輸入多個${isR ? '電阻' : '電容'}值（用空白或逗號分隔）`}
        value={text}
        onChange={setText}
        placeholder={isR ? '例 1k, 2k, 3k' : '例 1u, 2.2u'}
      />
      {values.length >= 1 ? (
        <div style={{ marginTop: 10, lineHeight: 1.9 }}>
          <div>串聯 = <span style={outStyle}>{formatEng(series, unit)}</span></div>
          <div>並聯 = <span style={outStyle}>{formatEng(parallel, unit)}</span></div>
          <div className="muted" style={{ fontSize: 12 }}>{values.length} 個元件</div>
        </div>
      ) : <p className="muted" style={{ fontSize: 12 }}>輸入至少一個值。</p>}
    </Card>
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
    <Card title="進位轉換" icon="#">
      <Row>
        <Field label="數值" value={val} onChange={setVal} placeholder="例 255 / FF / 1010" />
        <label style={{ display: 'block' }}>
          <span style={labelStyle}>輸入進位</span>
          <select style={inputStyle} value={base} onChange={(e) => setBase(Number(e.target.value))}>
            <option value={2}>二進位 (BIN)</option>
            <option value={8}>八進位 (OCT)</option>
            <option value={10}>十進位 (DEC)</option>
            <option value={16}>十六進位 (HEX)</option>
          </select>
        </label>
      </Row>
      {ok ? (
        <div style={{ lineHeight: 1.9 }}>
          <div>BIN = <span style={outStyle}>{out.bin}</span></div>
          <div>OCT = <span style={outStyle}>{out.oct}</span></div>
          <div>DEC = <span style={outStyle}>{out.dec}</span></div>
          <div>HEX = <span style={outStyle}>{out.hex}</span></div>
        </div>
      ) : <p className="muted" style={{ fontSize: 12 }}>輸入一個有效數值。</p>}
    </Card>
  );
}

export default function EETools() {
  const tools = useMemo(() => ([
    <OhmsLaw key="ohm" />, <VoltageDivider key="vdiv" />, <ResistorColorCode key="res" />,
    <Reactive key="rc" />, <SeriesParallel key="sp" />, <BaseConverter key="base" />,
  ]), []);
  return (
    <div>
      <PageHeader
        eyebrow="TOOLBOX"
        title="EE 工具"
        description="電機常用快速計算：歐姆定律、分壓、電阻色碼、RC/RL/LC、串並聯與進位轉換。輸入支援工程記號（k、m、u、n…）。"
      />
      <div style={gridStyle}>{tools}</div>
    </div>
  );
}
