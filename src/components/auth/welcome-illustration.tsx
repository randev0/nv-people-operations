/**
 * Original flat line illustration for the sign-in page: a person sitting cross-legged
 * with a laptop, a ticked checklist floating beside them, a plant and a mug, with
 * scattered geometric confetti. Ink on the panel colour; decorative only.
 */
export function WelcomeIllustration({ className }: { className?: string }) {
  const ink = "hsl(240 10% 7%)";
  const paper = "hsl(var(--sun))";
  const s = { stroke: ink, strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 400 480" className={className} aria-hidden focusable="false">
      {/* confetti */}
      <g {...s} fill="none">
        <circle cx="62" cy="70" r="7" />
        <circle cx="342" cy="300" r="6" />
        <circle cx="80" cy="402" r="6" />
        <rect x="318" y="48" width="14" height="14" transform="rotate(45 325 55)" />
        <rect x="40" y="250" width="12" height="12" transform="rotate(45 46 256)" />
        <path d="M120 40 l10 -14" />
        <path d="M268 30 v16" />
        <path d="M356 150 h18" />
        <path d="M30 170 l12 8" />
        <path d="M300 440 l12 -10" />
      </g>
      <g fill={ink}>
        <circle cx="352" cy="96" r="7" />
        <rect x="160" y="22" width="12" height="12" transform="rotate(18 166 28)" />
        <rect x="358" y="392" width="10" height="10" transform="rotate(-12 363 397)" />
        <circle cx="30" cy="330" r="5" />
      </g>

      {/* floating checklist */}
      <g transform="rotate(-6 92 150)">
        <rect x="40" y="104" width="112" height="96" rx="12" fill={paper} {...s} />
        {[128, 152, 176].map((y, i) => (
          <g key={y}>
            <rect x="54" y={y - 8} width="16" height="16" rx="4" fill={i < 2 ? ink : paper} {...s} />
            {i < 2 ? <path d={`M57 ${y} l4 4 l7 -8`} stroke={paper} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
            <path d={`M80 ${y} h${i === 1 ? 44 : 56}`} {...s} />
          </g>
        ))}
      </g>

      {/* floor */}
      <path d="M44 420 H356" {...s} />

      {/* plant */}
      <path d="M316 420 l-8 -44 h40 l-8 44 z" fill={paper} {...s} />
      <path d="M328 376 c-4 -26 -22 -38 -34 -40 c4 18 16 32 34 40 z" fill={ink} />
      <path d="M330 376 c2 -30 16 -46 30 -50 c0 22 -12 40 -30 50 z" fill={ink} />
      <path d="M329 376 c0 -22 2 -40 0 -58" {...s} fill="none" />

      {/* mug */}
      <path d="M70 420 v-30 h30 v30 z" fill={paper} {...s} />
      <path d="M100 398 c12 0 12 16 0 16" {...s} fill="none" />
      <path d="M78 382 c-4 -6 4 -10 0 -16 M90 382 c-4 -6 4 -10 0 -16" {...s} fill="none" />

      {/* legs, crossed */}
      <path d="M118 404 C 112 370, 170 352, 206 366 C 244 352, 300 368, 288 404 C 276 424, 140 426, 118 404 Z" fill={paper} {...s} />
      <path d="M150 396 C 186 384, 230 384, 262 398" {...s} fill="none" />

      {/* torso (sweater) */}
      <path d="M150 360 C 146 300, 152 252, 176 236 C 190 228, 214 228, 228 236 C 252 252, 258 300, 254 360 Z" fill={ink} />
      {/* arms reaching to the laptop */}
      <path d="M170 248 C 150 270, 146 304, 162 326" stroke={ink} strokeWidth="18" strokeLinecap="round" fill="none" />
      <path d="M234 248 C 254 270, 258 304, 242 326" stroke={ink} strokeWidth="18" strokeLinecap="round" fill="none" />

      <path d="M176 262 C 166 280, 164 300, 170 318 M228 262 C 238 280, 240 300, 234 318" stroke={paper} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* laptop: back of the screen faces us */}
      <path d="M148 296 h108 l-8 58 h-92 z" fill={paper} {...s} />
      <circle cx="202" cy="324" r="6" fill={ink} />
      <path d="M140 354 h124" {...s} />
      {/* hands */}
      <circle cx="160" cy="346" r="9" fill={paper} {...s} />
      <circle cx="244" cy="346" r="9" fill={paper} {...s} />

      {/* neck and head */}
      <path d="M192 212 v22 h20 v-22" fill={paper} {...s} />
      <path d="M160 170 C 156 120, 196 102, 214 106 C 246 110, 258 146, 250 176 C 246 192, 240 200, 236 204 L 236 160 C 220 150, 190 150, 168 160 L 168 204 C 164 196, 160 186, 160 170 Z" fill={ink} />
      <ellipse cx="202" cy="174" rx="34" ry="40" fill={paper} {...s} />
      <path d="M168 154 C 176 128, 230 124, 238 152 C 220 144, 200 136, 168 154 Z" fill={ink} />
      {/* face: closed happy eyes and a smile */}
      <path d="M186 174 q6 -6 12 0 M206 174 q6 -6 12 0" {...s} fill="none" />
      <path d="M192 190 q10 9 20 0" {...s} fill="none" />
      <circle cx="182" cy="186" r="4" fill="hsl(6 92% 67% / 0.5)" />
      <circle cx="222" cy="186" r="4" fill="hsl(6 92% 67% / 0.5)" />
    </svg>
  );
}
