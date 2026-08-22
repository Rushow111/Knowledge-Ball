import React from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

type NodePoint = {
  x: number;
  y: number;
  z: number;
  r: number;
  label?: string;
};

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

const nodes: NodePoint[] = Array.from({length: 54}, (_, i) => {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (i / 53) * 2;
  const radius = Math.sqrt(1 - y * y);
  const theta = golden * i;
  return {
    x: Math.cos(theta) * radius,
    y,
    z: Math.sin(theta) * radius,
    r: i % 9 === 0 ? 7 : i % 4 === 0 ? 5 : 3.3,
  };
});

const labelled: Array<{label: string; index: number}> = [
  {label: 'DEFINITION', index: 5},
  {label: 'FACT', index: 15},
  {label: 'PREMISE', index: 24},
  {label: 'REASONING', index: 31},
  {label: 'CONCLUSION', index: 38},
  {label: 'COUNTEREXAMPLE', index: 47},
];

const Background: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        'radial-gradient(circle at 50% 46%, rgba(16,24,64,0.96) 0%, rgba(6,8,24,1) 34%, #02030a 74%, #000 100%)',
    }}
  />
);

const StarField: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      {Array.from({length: 90}, (_, i) => {
        const x = ((i * 73) % 1280) + Math.sin(i * 1.73) * 40;
        const y = ((i * 131) % 720) + Math.cos(i * 0.91) * 22;
        const pulse = 0.2 + 0.5 * (0.5 + 0.5 * Math.sin(frame * 0.03 + i));
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: i % 7 === 0 ? 2 : 1,
              height: i % 7 === 0 ? 2 : 1,
              borderRadius: 999,
              background: '#d8f6ff',
              opacity: pulse,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const ChaosScene: React.FC = () => {
  const frame = useCurrentFrame();
  const words = [
    'axiom', 'definition', 'claim', 'fact', 'source', 'proof', 'theory', 'premise',
    'evidence', 'reasoning', 'model', 'concept', 'counterexample', 'conclusion', 'relation',
  ];
  const fade = interpolate(frame, [0, 12, 70, 90], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{opacity: fade, overflow: 'hidden'}}>
      {Array.from({length: 44}, (_, i) => {
        const angle = i * 0.71;
        const speed = 0.65 + (i % 7) * 0.12;
        const x = 640 + Math.cos(angle + frame * 0.01 * speed) * (120 + (i % 11) * 54);
        const y = 360 + Math.sin(angle * 1.2 + frame * 0.008 * speed) * (80 + (i % 8) * 42);
        const drift = interpolate(frame, [0, 90], [1.25, 0.72], clamp);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              translate: '-50% -50%',
              scale: drift,
              fontFamily: 'Arial, sans-serif',
              fontSize: 14 + (i % 4) * 7,
              letterSpacing: 1.2,
              color: i % 3 === 0 ? '#77e8ff' : i % 3 === 1 ? '#a78bfa' : '#d7e2ff',
              opacity: 0.18 + (i % 5) * 0.12,
              rotate: `${(i * 19 + frame * 0.35 * (i % 2 ? 1 : -1)) % 360}deg`,
            }}
          >
            {words[i % words.length]}
          </div>
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 82,
          textAlign: 'center',
          color: '#f7fbff',
          fontFamily: 'Arial, sans-serif',
          fontWeight: 700,
          fontSize: 42,
          letterSpacing: 5,
          opacity: interpolate(frame, [8, 22, 62, 78], [0, 1, 1, 0], clamp),
        }}
      >
        KNOWLEDGE IS EVERYWHERE.
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 34,
          textAlign: 'center',
          color: '#8feaff',
          fontFamily: 'Arial, sans-serif',
          fontSize: 24,
          letterSpacing: 7,
          opacity: interpolate(frame, [25, 38, 68, 82], [0, 1, 1, 0], clamp),
        }}
      >
        UNDERSTANDING ISN’T.
      </div>
    </AbsoluteFill>
  );
};

const SphereGraph: React.FC<{localFrame: number; revealLabels?: boolean; splitLayer?: boolean}> = ({
  localFrame,
  revealLabels = false,
  splitLayer = false,
}) => {
  const rotate = localFrame * 0.012;
  const appear = interpolate(localFrame, [0, 36], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  const coreScale = interpolate(localFrame, [0, 28], [0.15, 1], {...clamp, easing: Easing.out(Easing.back(1.4))});
  const projected = nodes.map((n, i) => {
    const xr = n.x * Math.cos(rotate) - n.z * Math.sin(rotate);
    const zr = n.x * Math.sin(rotate) + n.z * Math.cos(rotate);
    const perspective = 1 + zr * 0.15;
    return {
      x: 640 + xr * 245 * perspective,
      y: 360 + n.y * 245 * perspective,
      z: zr,
      r: n.r * (0.78 + perspective * 0.32),
      i,
    };
  });

  return (
    <AbsoluteFill style={{opacity: appear}}>
      <svg width="1280" height="720" style={{position: 'absolute', inset: 0}}>
        {projected.map((p, i) => {
          const q = projected[(i * 7 + 11) % projected.length];
          if (Math.abs(p.i - q.i) > 24) return null;
          return (
            <line
              key={`l${i}`}
              x1={p.x}
              y1={p.y}
              x2={q.x}
              y2={q.y}
              stroke={i % 3 === 0 ? '#16d9ff' : '#7657ff'}
              strokeWidth={0.8}
              opacity={0.16 + Math.max(-0.05, (p.z + q.z) * 0.08)}
            />
          );
        })}
        {splitLayer && (
          <>
            <ellipse cx="640" cy="360" rx="332" ry="115" fill="none" stroke="#66efff" strokeWidth="1.5" opacity="0.58" />
            <ellipse cx="640" cy="360" rx="292" ry="205" fill="none" stroke="#b08aff" strokeWidth="1.5" opacity="0.5" transform="rotate(-28 640 360)" />
          </>
        )}
      </svg>

      <div
        style={{
          position: 'absolute',
          left: 640,
          top: 360,
          width: 84,
          height: 84,
          borderRadius: '50%',
          translate: '-50% -50%',
          scale: coreScale,
          background: 'radial-gradient(circle, #fff 0%, #f6fdff 25%, #dff9ff 46%, rgba(125,225,255,.25) 70%, rgba(255,255,255,0) 100%)',
          boxShadow: '0 0 24px rgba(255,255,255,.95), 0 0 72px rgba(80,210,255,.6), 0 0 130px rgba(117,86,255,.35)',
        }}
      />

      {projected
        .sort((a, b) => a.z - b.z)
        .map((p) => (
          <div
            key={p.i}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: p.r * 2,
              height: p.r * 2,
              borderRadius: '50%',
              translate: '-50% -50%',
              background: p.i % 3 === 0 ? '#55ecff' : p.i % 3 === 1 ? '#7c6cff' : '#b18cff',
              boxShadow: p.r > 5 ? '0 0 15px currentColor' : '0 0 8px rgba(95,220,255,.7)',
              opacity: 0.48 + (p.z + 1) * 0.22,
            }}
          />
        ))}

      {revealLabels &&
        labelled.map(({label, index}, j) => {
          const p = projected[index];
          const show = interpolate(localFrame, [30 + j * 10, 42 + j * 10], [0, 1], clamp);
          return (
            <div
              key={label}
              style={{
                position: 'absolute',
                left: p.x + 10,
                top: p.y - 18,
                color: '#e9faff',
                fontFamily: 'Arial, sans-serif',
                fontSize: 14,
                letterSpacing: 2.2,
                opacity: show,
                textShadow: '0 0 14px #54e8ff',
              }}
            >
              {label}
            </div>
          );
        })}
    </AbsoluteFill>
  );
};

const ReasoningScene: React.FC = () => {
  const frame = useCurrentFrame();
  const items = ['PREMISE', 'REASONING', 'CONCLUSION'];
  return (
    <AbsoluteFill>
      <SphereGraph localFrame={frame + 120} />
      <div style={{position: 'absolute', left: 160, right: 160, bottom: 76, display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        {items.map((label, i) => {
          const show = interpolate(frame, [i * 16, i * 16 + 12], [0, 1], clamp);
          return (
            <React.Fragment key={label}>
              <div style={{opacity: show, color: '#fff', fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 22, letterSpacing: 3, padding: '12px 18px', border: '1px solid rgba(122,227,255,.48)', background: 'rgba(6,12,32,.72)', boxShadow: '0 0 26px rgba(66,210,255,.12)'}}>{label}</div>
              {i < items.length - 1 && <div style={{fontSize: 34, color: '#62eaff', opacity: interpolate(frame, [i * 16 + 8, i * 16 + 20], [0, 1], clamp)}}>→</div>}
            </React.Fragment>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const CounterexampleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const hit = interpolate(frame, [36, 56], [0, 1], {...clamp, easing: Easing.out(Easing.quad)});
  const split = interpolate(frame, [70, 108], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill>
      <SphereGraph localFrame={frame + 260} revealLabels />
      <div style={{position: 'absolute', left: 90 + hit * 330, top: 125 + hit * 45, color: '#ff7de3', fontFamily: 'Arial, sans-serif', fontWeight: 800, fontSize: 20, letterSpacing: 2.5, opacity: interpolate(frame, [12, 22, 62, 80], [0, 1, 1, 0], clamp), textShadow: '0 0 18px rgba(255,85,220,.75)'}}>COUNTEREXAMPLE</div>
      {Array.from({length: 7}, (_, i) => {
        const angle = (i / 7) * Math.PI * 2;
        return (
          <div key={i} style={{position: 'absolute', left: 640 + Math.cos(angle) * 110 * split, top: 360 + Math.sin(angle) * 110 * split, width: 12, height: 12, borderRadius: '50%', translate: '-50% -50%', background: i % 2 ? '#6ceeff' : '#9b7cff', opacity: split, boxShadow: '0 0 12px currentColor'}} />
        );
      })}
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 44, textAlign: 'center', color: '#fff', fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 31, letterSpacing: 6, opacity: interpolate(frame, [86, 106, 138, 154], [0, 1, 1, 0], clamp)}}>TRACE IT. CHALLENGE IT. IMPROVE IT.</div>
    </AbsoluteFill>
  );
};

const LayerScene: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <SphereGraph localFrame={frame + 430} splitLayer />
      <div style={{position: 'absolute', left: 105, top: 120, fontFamily: 'Arial, sans-serif', color: '#77ecff', fontSize: 18, letterSpacing: 3.5, opacity: interpolate(frame, [8, 28], [0, 1], clamp)}}>SHARED KNOWLEDGE</div>
      <div style={{position: 'absolute', right: 105, top: 120, fontFamily: 'Arial, sans-serif', color: '#b69bff', fontSize: 18, letterSpacing: 3.5, opacity: interpolate(frame, [24, 44], [0, 1], clamp)}}>PRIVATE MASTERY</div>
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 48, textAlign: 'center', color: '#dff8ff', fontFamily: 'Arial, sans-serif', fontSize: 22, letterSpacing: 4, opacity: interpolate(frame, [40, 58, 100, 120], [0, 1, 1, 0], clamp)}}>A STRUCTURE YOU CAN SEE — AND QUESTION.</div>
    </AbsoluteFill>
  );
};

const EndScene: React.FC = () => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 36], [0.82, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <div style={{position: 'absolute', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.9) 0%, rgba(173,243,255,.34) 22%, rgba(86,117,255,.12) 50%, rgba(0,0,0,0) 72%)', filter: 'blur(4px)', opacity: interpolate(frame, [0, 24], [0, 1], clamp)}} />
      <div style={{scale, opacity: interpolate(frame, [0, 20], [0, 1], clamp), textAlign: 'center'}}>
        <div style={{fontFamily: 'Arial, sans-serif', fontWeight: 800, color: '#fff', fontSize: 64, letterSpacing: 10, textShadow: '0 0 28px rgba(111,229,255,.45)'}}>KNOWLEDGE BALL</div>
        <div style={{marginTop: 18, fontFamily: 'Arial, sans-serif', color: '#8feaff', fontSize: 19, letterSpacing: 5}}>SEE KNOWLEDGE. QUESTION IT. BUILD ON IT.</div>
      </div>
    </AbsoluteFill>
  );
};

export const KnowledgeBallPromo: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      <Background />
      <StarField />
      <Sequence from={0} durationInFrames={105}><ChaosScene /></Sequence>
      <Sequence from={78} durationInFrames={170}><SphereGraph localFrame={useCurrentFrame() - 78} revealLabels /></Sequence>
      <Sequence from={210} durationInFrames={145}><ReasoningScene /></Sequence>
      <Sequence from={345} durationInFrames={175}><CounterexampleScene /></Sequence>
      <Sequence from={505} durationInFrames={120}><LayerScene /></Sequence>
      <Sequence from={615} durationInFrames={105}><EndScene /></Sequence>
    </AbsoluteFill>
  );
};
