import React from 'react';
import {AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame, useVideoConfig} from 'remotion';

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const W = 1280;
const H = 720;

const palette = {
  bg: '#02030a',
  bg2: '#071024',
  white: '#f7fbff',
  cyan: '#5be9ff',
  blue: '#4f7cff',
  violet: '#8b6dff',
  magenta: '#ff79d8',
  dim: '#8aa0c8',
};

type Node = {x: number; y: number; z: number; r: number; label?: string};
const nodeLabels = ['DEFINITION', 'FACT', 'PREMISE', 'REASONING', 'CONCLUSION', 'COUNTEREXAMPLE'];
const sphereNodes: Node[] = Array.from({length: 86}, (_, i) => {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (i / 85) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = golden * i;
  return {
    x: Math.cos(theta) * radius,
    y,
    z: Math.sin(theta) * radius,
    r: i % 13 === 0 ? 7 : i % 5 === 0 ? 4.8 : 3.1,
    label: i < nodeLabels.length ? nodeLabels[i] : undefined,
  };
});

const Background: React.FC<{accent?: number}> = ({accent = 0}) => {
  const frame = useCurrentFrame();
  const drift = 50 + Math.sin(frame * 0.004 + accent) * 7;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at ${drift}% 44%, rgba(19,35,92,.82) 0%, rgba(5,10,30,.96) 34%, ${palette.bg} 76%, #000 100%)`,
        overflow: 'hidden',
      }}
    >
      {Array.from({length: 95}, (_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: ((i * 137) % W) + Math.sin(i * 1.9) * 18,
            top: ((i * 83) % H) + Math.cos(i * 1.3) * 18,
            width: i % 11 === 0 ? 2 : 1,
            height: i % 11 === 0 ? 2 : 1,
            borderRadius: 99,
            background: i % 4 === 0 ? palette.cyan : palette.white,
            opacity: 0.12 + 0.26 * (0.5 + 0.5 * Math.sin(frame * 0.018 + i)),
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

const ChapterTitle: React.FC<{kicker: string; title: string; subtitle?: string}> = ({kicker, title, subtitle}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{position: 'absolute', left: 72, top: 58, width: 600}}>
      <div style={{color: palette.cyan, fontFamily: 'Arial, sans-serif', fontSize: 15, letterSpacing: 5, opacity: interpolate(frame, [0, 24], [0, 1], clamp)}}>{kicker}</div>
      <div style={{marginTop: 14, color: palette.white, fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 48, lineHeight: 1.04, letterSpacing: 1.5, opacity: interpolate(frame, [10, 42], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)})}}>{title}</div>
      {subtitle ? <div style={{marginTop: 16, color: '#b9cae9', fontFamily: 'Arial, sans-serif', fontSize: 20, lineHeight: 1.45, width: 540, opacity: interpolate(frame, [30, 64], [0, 1], clamp)}}>{subtitle}</div> : null}
    </div>
  );
};

const Progress: React.FC<{chapter: number}> = ({chapter}) => (
  <div style={{position: 'absolute', left: 72, right: 72, bottom: 32, height: 2, background: 'rgba(255,255,255,.09)'}}>
    <div style={{width: `${chapter * 10}%`, height: 2, background: `linear-gradient(90deg, ${palette.violet}, ${palette.cyan})`, boxShadow: '0 0 12px rgba(91,233,255,.5)'}} />
  </div>
);

const Sphere: React.FC<{labels?: boolean; split?: boolean; scale?: number; highlight?: number[]}> = ({labels = false, split = false, scale = 1, highlight = []}) => {
  const frame = useCurrentFrame();
  const rotate = frame * 0.0045;
  const appear = interpolate(frame, [0, 45], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  const projected = sphereNodes.map((n, i) => {
    const xr = n.x * Math.cos(rotate) - n.z * Math.sin(rotate);
    const zr = n.x * Math.sin(rotate) + n.z * Math.cos(rotate);
    const p = 1 + zr * 0.17;
    return {x: 830 + xr * 250 * p * scale, y: 366 + n.y * 250 * p * scale, z: zr, r: n.r * (0.8 + p * 0.3), i, label: n.label};
  });
  return (
    <div style={{position: 'absolute', inset: 0, opacity: appear}}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        {projected.map((p, i) => {
          const q = projected[(i * 9 + 17) % projected.length];
          if (Math.abs(p.i - q.i) > 42) return null;
          return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={i % 3 ? palette.violet : palette.cyan} strokeWidth={0.7} opacity={0.11 + (p.z + 1) * 0.05} />;
        })}
        {split ? <>
          <ellipse cx="830" cy="366" rx="320" ry="105" fill="none" stroke={palette.cyan} strokeWidth="1.4" opacity=".45" />
          <ellipse cx="830" cy="366" rx="275" ry="205" fill="none" stroke={palette.violet} strokeWidth="1.4" opacity=".42" transform="rotate(-30 830 366)" />
        </> : null}
      </svg>
      <div style={{position: 'absolute', left: 830, top: 366, width: 92, height: 92, borderRadius: '50%', translate: '-50% -50%', background: 'radial-gradient(circle, #fff 0%, #fff 18%, #ddfbff 38%, rgba(117,229,255,.28) 64%, rgba(255,255,255,0) 100%)', boxShadow: '0 0 26px rgba(255,255,255,.96), 0 0 82px rgba(77,218,255,.56), 0 0 145px rgba(126,91,255,.34)'}} />
      {projected.sort((a, b) => a.z - b.z).map((p) => {
        const hot = highlight.includes(p.i);
        return <div key={p.i} style={{position: 'absolute', left: p.x, top: p.y, width: p.r * (hot ? 3.2 : 2), height: p.r * (hot ? 3.2 : 2), borderRadius: '50%', translate: '-50% -50%', background: hot ? '#fff' : p.i % 3 === 0 ? palette.cyan : p.i % 3 === 1 ? palette.blue : palette.violet, boxShadow: hot ? '0 0 22px #fff, 0 0 38px rgba(91,233,255,.8)' : '0 0 9px rgba(91,233,255,.55)', opacity: hot ? 1 : .45 + (p.z + 1) * .2}} />;
      })}
      {labels ? projected.filter((p) => p.label).map((p, i) => <div key={p.label} style={{position: 'absolute', left: p.x + 12, top: p.y - 18, color: i === 5 ? '#ff9de4' : palette.white, fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 13, letterSpacing: 2, opacity: interpolate(frame, [50 + i * 20, 82 + i * 20], [0, 1], clamp), textShadow: '0 0 12px rgba(91,233,255,.75)'}}>{p.label}</div>) : null}
    </div>
  );
};

const Chaos: React.FC = () => {
  const frame = useCurrentFrame();
  const terms = ['paper', 'post', 'database', 'definition', 'claim', 'model', 'proof', 'source', 'video', 'fact', 'theory', 'evidence', 'context', 'argument', 'AI output'];
  return <AbsoluteFill><Background accent={1} />
    {Array.from({length: 58}, (_, i) => {
      const a = i * .77;
      const x = 640 + Math.cos(a + frame * .003 * (1 + i % 4)) * (90 + (i % 12) * 46);
      const y = 360 + Math.sin(a * 1.16 + frame * .0026) * (65 + (i % 8) * 39);
      return <div key={i} style={{position: 'absolute', left: x, top: y, translate: '-50% -50%', rotate: `${i * 23 + frame * .04 * (i % 2 ? 1 : -1)}deg`, color: i % 3 === 0 ? palette.cyan : i % 3 === 1 ? palette.violet : '#d7e4ff', opacity: .15 + (i % 5) * .09, fontFamily: 'Arial, sans-serif', fontSize: 15 + (i % 4) * 5, letterSpacing: 1.2}}>{terms[i % terms.length]}</div>;
    })}
    <ChapterTitle kicker="01 — THE PROBLEM" title="More information. Less inspectability." subtitle="We can store almost everything — but the structure behind knowledge is still difficult to see." />
    <Progress chapter={1} />
  </AbsoluteFill>;
};

const Structure: React.FC = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill><Background accent={2} /><ChapterTitle kicker="02 — STRUCTURE" title="From documents to explicit knowledge." subtitle="Definitions, assumptions, reasoning and contradictions should not disappear inside paragraphs." />
    <Sphere scale={.92} />
    <div style={{position: 'absolute', left: 100, top: 380, width: 430, color: '#c8d8f4', fontFamily: 'Arial, sans-serif', fontSize: 19, lineHeight: 1.55, opacity: interpolate(frame, [90, 140], [0, 1], clamp)}}>A navigable graph can expose how ideas depend on each other instead of storing only the final text.</div>
    <Progress chapter={2} /></AbsoluteFill>;
};

const NodeTypes: React.FC = () => <AbsoluteFill><Background accent={3} /><ChapterTitle kicker="03 — KNOWLEDGE NODES" title="Make the building blocks visible." subtitle="The goal is not more boxes. It is smaller units with explicit meaning and relationships." />
  <Sphere labels scale={.92} highlight={[0,1,2,3,4,5]} /><Progress chapter={3} /></AbsoluteFill>;

const Trace: React.FC = () => {
  const frame = useCurrentFrame();
  const items = ['DEFINITION', 'FACT', 'PREMISE', 'REASONING', 'CONCLUSION'];
  return <AbsoluteFill><Background accent={4} /><ChapterTitle kicker="04 — TRACEABILITY" title="Do not show only the answer." subtitle="Move backward from a conclusion to the reasoning, premises, definitions and evidence that support it." />
    <div style={{position: 'absolute', left: 85, right: 85, top: 400, display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>{items.map((t, i) => <React.Fragment key={t}><div style={{padding: '16px 18px', border: `1px solid ${i === 4 ? 'rgba(91,233,255,.75)' : 'rgba(139,109,255,.45)'}`, background: 'rgba(5,12,35,.78)', color: palette.white, fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 17, letterSpacing: 2.2, opacity: interpolate(frame, [i * 55 + 80, i * 55 + 120], [0, 1], clamp), boxShadow: i === 4 ? '0 0 28px rgba(91,233,255,.18)' : undefined}}>{t}</div>{i < items.length - 1 ? <div style={{color: palette.cyan, fontSize: 30, opacity: interpolate(frame, [i * 55 + 110, i * 55 + 145], [0, 1], clamp)}}>→</div> : null}</React.Fragment>)}</div>
    <Progress chapter={4} /></AbsoluteFill>;
};

const Challenge: React.FC = () => {
  const frame = useCurrentFrame();
  const impact = interpolate(frame, [250, 380], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  return <AbsoluteFill><Background accent={5} /><ChapterTitle kicker="05 — CORRECTION" title="Disagreement should remain visible." subtitle="A valid counterexample should reveal what failed, why it failed, and what other conclusions depend on it." />
    <Sphere scale={.9} highlight={[4,5,27]} />
    <div style={{position: 'absolute', left: 150 + impact * 430, top: 340 - impact * 60, padding: '13px 18px', color: '#ffd8f2', border: '1px solid rgba(255,121,216,.65)', background: 'rgba(49,10,45,.7)', fontFamily: 'Arial, sans-serif', fontWeight: 800, fontSize: 17, letterSpacing: 2.3, boxShadow: '0 0 28px rgba(255,121,216,.18)'}}>COUNTEREXAMPLE</div>
    <div style={{position: 'absolute', right: 62, bottom: 68, color: '#dce7ff', fontFamily: 'Arial, sans-serif', fontSize: 18, letterSpacing: 2, opacity: interpolate(frame, [420, 510], [0, 1], clamp)}}>Correction becomes part of the knowledge history.</div>
    <Progress chapter={5} /></AbsoluteFill>;
};

const Decompose: React.FC = () => {
  const frame = useCurrentFrame();
  const spread = interpolate(frame, [130, 330], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  const pts = [[620,360],[720,290],[780,390],[900,305],[980,390]];
  return <AbsoluteFill><Background accent={6} /><ChapterTitle kicker="06 — DECOMPOSITION" title="Break complexity without breaking logic." subtitle="A decomposition is complete only when the new reasoning path still connects the original premises to the original conclusion." />
    <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>{pts.slice(0,-1).map((p,i) => {const q=pts[i+1]; return <line key={i} x1={620+(p[0]-620)*spread} y1={360+(p[1]-360)*spread} x2={620+(q[0]-620)*spread} y2={360+(q[1]-360)*spread} stroke={i%2?palette.violet:palette.cyan} strokeWidth="2" opacity={spread*.75}/>;})}</svg>
    {pts.map((p,i)=><div key={i} style={{position:'absolute',left:620+(p[0]-620)*spread,top:360+(p[1]-360)*spread,width:i===0||i===pts.length-1?34:24,height:i===0||i===pts.length-1?34:24,borderRadius:'50%',translate:'-50% -50%',background:i===0?'#d8f7ff':i===pts.length-1?'#fff':i%2?palette.cyan:palette.violet,boxShadow:'0 0 22px rgba(91,233,255,.55)'}}/>) }
    <div style={{position:'absolute',left:555,top:425,color:'#bcd0ee',fontFamily:'Arial, sans-serif',fontSize:16,letterSpacing:1.5,opacity:interpolate(frame,[330,430],[0,1],clamp)}}>premise → intermediate result → reasoning → intermediate result → conclusion</div>
    <Progress chapter={6} /></AbsoluteFill>;
};

const Merge: React.FC = () => {
  const frame = useCurrentFrame();
  const close = interpolate(frame, [130, 360], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
  return <AbsoluteFill><Background accent={7} /><ChapterTitle kicker="07 — MERGE + VALIDATION" title="Equivalent is not the same as similar." subtitle="Adding, challenging, decomposing and merging should use explicit commands and explicit validation rules." />
    <div style={{position:'absolute',left:650-close*115,top:345,width:150,height:150,borderRadius:'50%',translate:'-50% -50%',border:`2px solid ${palette.cyan}`,background:'rgba(28,105,145,.18)',boxShadow:'0 0 45px rgba(91,233,255,.18)'}}/>
    <div style={{position:'absolute',left:900-close*135,top:345,width:150,height:150,borderRadius:'50%',translate:'-50% -50%',border:`2px solid ${palette.violet}`,background:'rgba(94,65,169,.18)',boxShadow:'0 0 45px rgba(139,109,255,.18)'}}/>
    <div style={{position:'absolute',left:770,top:450,color:palette.white,fontFamily:'Arial, sans-serif',fontWeight:700,fontSize:18,letterSpacing:3,opacity:interpolate(frame,[340,430],[0,1],clamp)}}>VALIDATE BEFORE MERGE</div>
    <div style={{position:'absolute',left:92,bottom:92,display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:10,width:550}}>{['ADD','CHALLENGE','DECOMPOSE','MERGE'].map((x,i)=><div key={x} style={{padding:'12px 10px',textAlign:'center',border:'1px solid rgba(255,255,255,.15)',background:'rgba(10,20,46,.72)',color:i===1?'#ffb1e6':palette.white,fontFamily:'Arial, sans-serif',fontSize:13,fontWeight:700,letterSpacing:1.8}}>{x}</div>)}</div>
    <Progress chapter={7} /></AbsoluteFill>;
};

const Layers: React.FC = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill><Background accent={8} /><ChapterTitle kicker="08 — TWO LAYERS" title="Shared truth is not personal mastery." subtitle="The public graph describes knowledge. A private layer can describe what each person has studied, understood, forgotten or wants to revisit." />
    <Sphere split scale={.88} />
    <div style={{position:'absolute',right:88,top:120,color:palette.cyan,fontFamily:'Arial, sans-serif',fontSize:17,fontWeight:700,letterSpacing:3,opacity:interpolate(frame,[120,210],[0,1],clamp)}}>SHARED KNOWLEDGE</div>
    <div style={{position:'absolute',right:88,top:158,color:'#c2a9ff',fontFamily:'Arial, sans-serif',fontSize:17,fontWeight:700,letterSpacing:3,opacity:interpolate(frame,[240,330],[0,1],clamp)}}>PRIVATE LEARNING STATE</div>
    <Progress chapter={8} /></AbsoluteFill>;
};

const Uses: React.FC = () => {
  const frame = useCurrentFrame();
  const cards = [
    ['STUDENT','Find the exact prerequisite that is missing.'],
    ['RESEARCHER','Inspect where two theories actually diverge.'],
    ['AI','Return an answer with an explicit dependency path.'],
    ['COMMUNITY','Improve shared knowledge without erasing correction history.'],
  ];
  return <AbsoluteFill><Background accent={9} /><ChapterTitle kicker="09 — WHAT THIS ENABLES" title="A graph that can be used, not just viewed." subtitle="Once knowledge relationships are explicit, learning, research and AI reasoning can operate on the same structure." />
    <div style={{position:'absolute',left:78,right:78,top:300,display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}>{cards.map((c,i)=><div key={c[0]} style={{padding:'22px 24px',border:'1px solid rgba(104,197,255,.18)',background:'linear-gradient(135deg, rgba(10,23,55,.84), rgba(19,12,46,.72))',opacity:interpolate(frame,[80+i*75,140+i*75],[0,1],clamp)}}><div style={{color:i%2?palette.violet:palette.cyan,fontFamily:'Arial, sans-serif',fontWeight:800,fontSize:14,letterSpacing:3}}>{c[0]}</div><div style={{marginTop:10,color:'#e4edff',fontFamily:'Arial, sans-serif',fontSize:18,lineHeight:1.4}}>{c[1]}</div></div>)}</div>
    <Progress chapter={9} /></AbsoluteFill>;
};

const Vision: React.FC = () => {
  const frame = useCurrentFrame();
  const questions = ['Can rules remain consistent?', 'Can errors be corrected without destroying history?', 'Can millions of nodes remain understandable?', 'Can humans and AI contribute without turning the graph into noise?'];
  return <AbsoluteFill><Background accent={10} /><Sphere scale={1.02} />
    <div style={{position:'absolute',left:68,top:58,color:palette.cyan,fontFamily:'Arial, sans-serif',fontSize:14,letterSpacing:5}}>10 — THE OPEN QUESTION</div>
    <div style={{position:'absolute',left:68,top:112,width:500,color:palette.white,fontFamily:'Arial, sans-serif',fontWeight:700,fontSize:39,lineHeight:1.08}}>A better structure should survive criticism.</div>
    <div style={{position:'absolute',left:70,top:265,width:520,display:'flex',flexDirection:'column',gap:12}}>{questions.map((q,i)=><div key={q} style={{color:'#c8d9f4',fontFamily:'Arial, sans-serif',fontSize:17,lineHeight:1.4,opacity:interpolate(frame,[60+i*80,110+i*80],[0,1],clamp)}}>{q}</div>)}</div>
    <div style={{position:'absolute',left:0,right:0,bottom:95,textAlign:'center',opacity:interpolate(frame,[520,650],[0,1],clamp)}}><div style={{color:palette.white,fontFamily:'Arial, sans-serif',fontWeight:800,fontSize:48,letterSpacing:8,textShadow:'0 0 30px rgba(91,233,255,.22)'}}>KNOWLEDGE BALL</div><div style={{marginTop:16,color:palette.cyan,fontFamily:'Arial, sans-serif',fontSize:18,letterSpacing:6}}>SEE KNOWLEDGE. QUESTION IT. BUILD ON IT.</div></div>
    <Progress chapter={10} /></AbsoluteFill>;
};

const scenes = [Chaos, Structure, NodeTypes, Trace, Challenge, Decompose, Merge, Layers, Uses, Vision];

export const KnowledgeBallLong: React.FC = () => {
  const {fps} = useVideoConfig();
  const sceneFrames = 30 * fps;
  return <AbsoluteFill style={{background: palette.bg}}>{scenes.map((Scene, i) => <Sequence key={i} from={i * sceneFrames} durationInFrames={sceneFrames}><Scene /></Sequence>)}</AbsoluteFill>;
};
