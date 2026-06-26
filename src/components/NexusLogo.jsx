import React, { useId } from 'react';

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '');
}

function NexusMarkSvg({ idPrefix, tile = false }) {
  const tileGradient = `${idPrefix}-tile`;
  const tileStroke = `${idPrefix}-tileStroke`;
  const topFacet = `${idPrefix}-topFacet`;
  const leftFacet = `${idPrefix}-leftFacet`;
  const rightFacet = `${idPrefix}-rightFacet`;
  const lowerFacet = `${idPrefix}-lowerFacet`;
  const core = `${idPrefix}-core`;
  const coreGlow = `${idPrefix}-coreGlow`;
  const blueGlow = `${idPrefix}-blueGlow`;
  const bevel = `${idPrefix}-bevel`;

  return (
    <svg viewBox="0 0 112 112" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient
          id={tileGradient}
          x1="18"
          y1="10"
          x2="95"
          y2="105"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFFFFF" />
          <stop offset="0.55" stopColor="#F4FAFF" />
          <stop offset="1" stopColor="#E7F1FF" />
        </linearGradient>
        <linearGradient
          id={tileStroke}
          x1="18"
          y1="9"
          x2="100"
          y2="101"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFFFFF" />
          <stop offset="0.42" stopColor="#CFE8FF" />
          <stop offset="1" stopColor="#A8C6FF" />
        </linearGradient>
        <linearGradient
          id={topFacet}
          x1="21"
          y1="19"
          x2="87"
          y2="52"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#5DE5FF" />
          <stop offset="0.48" stopColor="#3A8CFF" />
          <stop offset="1" stopColor="#2042E7" />
        </linearGradient>
        <linearGradient
          id={leftFacet}
          x1="16"
          y1="43"
          x2="51"
          y2="95"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#4BD7FF" />
          <stop offset="0.58" stopColor="#357BFF" />
          <stop offset="1" stopColor="#244CE3" />
        </linearGradient>
        <linearGradient
          id={rightFacet}
          x1="58"
          y1="43"
          x2="93"
          y2="96"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#67B7FF" />
          <stop offset="0.48" stopColor="#315CF4" />
          <stop offset="1" stopColor="#1621A8" />
        </linearGradient>
        <linearGradient
          id={lowerFacet}
          x1="39"
          y1="66"
          x2="73"
          y2="101"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#3D86FF" />
          <stop offset="1" stopColor="#1C31C9" />
        </linearGradient>
        <radialGradient id={core} cx="38%" cy="30%" r="68%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.2" stopColor="#B8FBFF" />
          <stop offset="0.48" stopColor="#39B8FF" />
          <stop offset="0.76" stopColor="#255EF0" />
          <stop offset="1" stopColor="#1623A7" />
        </radialGradient>
        <radialGradient id={coreGlow} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#7DEBFF" stopOpacity="0.72" />
          <stop offset="0.48" stopColor="#2F8CFF" stopOpacity="0.25" />
          <stop offset="1" stopColor="#2F8CFF" stopOpacity="0" />
        </radialGradient>
        <filter id={blueGlow} x="-38%" y="-38%" width="176%" height="176%">
          <feGaussianBlur stdDeviation="3.6" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="0 0 0 0 0.08 0 0 0 0 0.50 0 0 0 0 1 0 0 0 .72 0"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={bevel} x="-12%" y="-12%" width="124%" height="124%">
          <feDropShadow dx="0" dy="9" stdDeviation="8" floodColor="#2A67D8" floodOpacity="0.2" />
          <feDropShadow dx="0" dy="1" stdDeviation="1.4" floodColor="#FFFFFF" floodOpacity="0.6" />
        </filter>
      </defs>

      {tile ? (
        <>
          <rect x="8" y="8" width="96" height="96" rx="25" fill={`url(#${tileGradient})`} />
          <rect
            x="8.8"
            y="8.8"
            width="94.4"
            height="94.4"
            rx="24.2"
            fill="none"
            stroke={`url(#${tileStroke})`}
            strokeWidth="1.6"
          />
        </>
      ) : null}

      <g filter={`url(#${bevel})`}>
        <path
          d="M56 12.5 94 34.2 70.2 48.1 56 40.4 41.8 48.1 18 34.2Z"
          fill={`url(#${topFacet})`}
        />
        <path d="M15.2 41.6 39.2 54.8 39.2 91.3 15.2 77.4Z" fill={`url(#${leftFacet})`} />
        <path d="M96.8 41.6 72.8 54.8 72.8 91.3 96.8 77.4Z" fill={`url(#${rightFacet})`} />
        <path
          d="M42.7 57 56 64.5 69.3 57 69.3 91.2 56 99 42.7 91.2Z"
          fill={`url(#${lowerFacet})`}
        />
        <path
          d="M56 42.8 69.3 50.4 69.3 65.4 56 73.2 42.7 65.4 42.7 50.4Z"
          fill="rgba(255,255,255,0.96)"
        />
        <path
          d="M23.2 37.3 42.2 48.4M88.8 37.3 69.8 48.4M40.8 91.8 40.8 58.4M71.2 91.8 71.2 58.4"
          fill="none"
          stroke="rgba(255,255,255,0.34)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </g>

      <g filter={`url(#${blueGlow})`}>
        <circle cx="56" cy="61.2" r="19" fill={`url(#${coreGlow})`} />
        <path
          d="M56 29.6v18.6M32.4 76.5l16.4-9.8M79.6 76.5l-16.4-9.8M39.1 34.3l9.7 16.1M72.9 34.3l-9.7 16.1"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M56 61.2 56 48.2M56 61.2 48.8 50.4M56 61.2 63.2 50.4M56 61.2 32.4 76.5M56 61.2 79.6 76.5"
          fill="none"
          stroke="rgba(68,196,255,0.42)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="56" cy="29.6" r="7.6" fill="#FFFFFF" />
        <circle cx="32.4" cy="76.5" r="7" fill="#FFFFFF" />
        <circle cx="79.6" cy="76.5" r="7" fill="#FFFFFF" />
        <circle cx="39.1" cy="34.3" r="4.6" fill="rgba(255,255,255,0.9)" />
        <circle cx="72.9" cy="34.3" r="4.6" fill="rgba(255,255,255,0.9)" />
        <circle cx="56" cy="61.2" r="12.8" fill={`url(#${core})`} />
        <circle cx="51.2" cy="56.3" r="4.4" fill="rgba(255,255,255,0.86)" />
        <circle
          cx="56"
          cy="61.2"
          r="13.5"
          fill="none"
          stroke="rgba(114,235,255,0.6)"
          strokeWidth="1.1"
        />
      </g>
    </svg>
  );
}

export default function NexusLogo({ className = 'brand-mark', title = 'NEXUS', variant = 'mark' }) {
  const idPrefix = `nexus-${safeId(useId())}`;

  if (variant === 'full') {
    const wordGradient = `${idPrefix}-word`;
    const xGradient = `${idPrefix}-x`;
    return (
      <span className={className} aria-label={`${title} PC Life Assistant`} role="img">
        <svg viewBox="0 0 520 132" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient
              id={wordGradient}
              x1="150"
              y1="28"
              x2="474"
              y2="72"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#061935" />
              <stop offset="0.65" stopColor="#06142A" />
              <stop offset="1" stopColor="#0B2344" />
            </linearGradient>
            <linearGradient
              id={xGradient}
              x1="286"
              y1="28"
              x2="352"
              y2="82"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#5AE7FF" />
              <stop offset="0.55" stopColor="#2F7CFF" />
              <stop offset="1" stopColor="#1E34C9" />
            </linearGradient>
          </defs>
          <g transform="translate(0 10)">
            <NexusMarkSvg idPrefix={`${idPrefix}-full`} tile />
          </g>
          <text
            x="142"
            y="75"
            fill={`url(#${wordGradient})`}
            fontFamily="Orbitron, Rajdhani, Segoe UI, Arial, sans-serif"
            fontSize="58"
            fontWeight="900"
            letterSpacing="3"
          >
            NE
          </text>
          <text
            x="275"
            y="75"
            fill={`url(#${xGradient})`}
            fontFamily="Orbitron, Rajdhani, Segoe UI, Arial, sans-serif"
            fontSize="58"
            fontWeight="900"
            letterSpacing="1"
          >
            X
          </text>
          <text
            x="334"
            y="75"
            fill={`url(#${wordGradient})`}
            fontFamily="Orbitron, Rajdhani, Segoe UI, Arial, sans-serif"
            fontSize="58"
            fontWeight="900"
            letterSpacing="3"
          >
            US
          </text>
          <text
            x="146"
            y="112"
            fill="#7C889A"
            fontFamily="Segoe UI, Arial, sans-serif"
            fontSize="18"
            fontWeight="600"
            letterSpacing="11"
          >
            PC Life Assistant
          </text>
        </svg>
      </span>
    );
  }

  return (
    <span className={className} aria-label={title} role="img">
      <NexusMarkSvg idPrefix={idPrefix} tile />
    </span>
  );
}
