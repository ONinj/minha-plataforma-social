/** Logo da Galhos: um bambu com uma folhinha na ponta, em roxo e roxo escuro. */
export default function Logo({ tamanho = 30 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 32 32" role="img" aria-label="Galhos" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="galhos-caule" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="0.45" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#5b21b6" />
        </linearGradient>
        <linearGradient id="galhos-folha" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#c4b5fd" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="#1d1235" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="#8b5cf6" strokeOpacity="0.35" />
      <g transform="rotate(10 16 17)">
        <rect x="13.9" y="20.4" width="4.2" height="8.4" rx="1.8" fill="url(#galhos-caule)" />
        <rect x="13.9" y="14" width="4.2" height="5.8" rx="1.8" fill="url(#galhos-caule)" />
        <rect x="13.9" y="8" width="4.2" height="5.4" rx="1.8" fill="url(#galhos-caule)" />
        <rect x="13.4" y="19.7" width="5.2" height="1.1" rx="0.5" fill="#4c1d95" />
        <rect x="13.4" y="13.3" width="5.2" height="1.1" rx="0.5" fill="#4c1d95" />
      </g>
      <path d="M17.2 9 C 18.2 4.8, 22.4 2.4, 26.8 3 C 25.6 7.2, 21.4 9.6, 17.2 9 Z" fill="url(#galhos-folha)" />
      <path d="M17.9 8.4 C 20.4 6.4, 23.2 4.6, 26 3.6" stroke="#3b0f7a" strokeWidth="0.7" fill="none" strokeLinecap="round" />
    </svg>
  );
}
