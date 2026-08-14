import React from 'react';
import {AbsoluteFill} from 'remotion';

type Point = {x: number; y: number; r: number; color: string; opacity: number};

const BG = 'radial-gradient(circle at 50% 46%, rgba(16,24,64,0.96) 0%, rgba(6,8,24,1) 34%, #02030a 74%, #000 100%)';
const CYAN = '#55ecff';
const BLUE = '#16d9ff';
const VIOLET = '#7c6cff';
const LILAC = '#b18cff';
const TEXT = '#f7fbff';
const MUTED = '#8ea0bd';
const PANEL = 'rgba(5,10,28,0.82)';
const BORDER = 'rgba(116,185,255,0.22)';

const points: Point[] = Array.from({length: 64}, (_, i) => {
  const a = i * 2.3999632297;
  const radius = 82 + (i % 9) * 27;
  const squash = 0.58 + ((i * 11) % 5) * 0.045;
  return {
    x: 640 + Math.cos(a) * radius,
    y: 360 + Math.sin(a) * radius * squash,
    r: i % 11 === 0 ? 7 : i % 4 === 0 ? 4.8 : 3,
    color: i % 3 === 0 ? CYAN : i % 3 === 1 ? VIOLET : LILAC,
    opacity: 0.46 + (i % 6) * 0.075,
  };
});

const Stars: React.FC = () => (
  <AbsoluteFill>
    {Array.from({length: 90}, (_, i) => {
      const x = ((i * 73) % 1280) + Math.sin(i * 1.73) * 36;
      const y = ((i * 131) % 720) + Math.cos(i * 0.91) * 20;
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
            opacity: 0.18 + (i % 5) * 0.08,
          }}
        />
      );
    })}
  </AbsoluteFill>
);

const GraphBackdrop: React.FC<{selected?: number}> = ({selected = -1}) => (
  <AbsoluteFill style={{overflow: 'hidden'}}>
    <svg width="1280" height="720" style={{position: 'absolute', inset: 0}}>
      {points.map((p, i) => {
        const q = points[(i * 7 + 11) % points.length];
        return (
          <line
            key={i}
            x1={p.x}
            y1={p.y}
            x2={q.x}
            y2={q.y}
            stroke={i % 3 === 0 ? BLUE : VIOLET}
            strokeWidth={0.75}
            opacity={0.12}
          />
        );
      })}
      <ellipse cx="640" cy="360" rx="342" ry="120" fill="none" stroke="#66efff" strokeWidth="1.1" opacity="0.28" />
      <ellipse cx="640" cy="360" rx="300" ry="210" fill="none" stroke="#b08aff" strokeWidth="1.1" opacity="0.24" transform="rotate(-28 640 360)" />
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
        background: 'radial-gradient(circle, #fff 0%, #f6fdff 25%, #dff9ff 46%, rgba(125,225,255,.25) 70%, rgba(255,255,255,0) 100%)',
        boxShadow: '0 0 24px rgba(255,255,255,.95), 0 0 72px rgba(80,210,255,.6), 0 0 130px rgba(117,86,255,.35)',
      }}
    />

    {points.map((p, i) => (
      <React.Fragment key={i}>
        {selected === i && (
          <div
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: p.r * 5.4,
              height: p.r * 5.4,
              borderRadius: '50%',
              translate: '-50% -50%',
              border: '1.5px solid rgba(108,238,255,.9)',
              boxShadow: '0 0 26px rgba(85,236,255,.75)',
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.r * 2,
            height: p.r * 2,
            borderRadius: '50%',
            translate: '-50% -50%',
            background: p.color,
            boxShadow: p.r > 5 ? '0 0 14px currentColor' : '0 0 8px rgba(95,220,255,.7)',
            opacity: p.opacity,
          }}
        />
      </React.Fragment>
    ))}
  </AbsoluteFill>
);

const Glass: React.FC<React.PropsWithChildren<{style?: React.CSSProperties}>> = ({children, style}) => (
  <div
    style={{
      background: PANEL,
      border: `1px solid ${BORDER}`,
      boxShadow: '0 18px 54px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.035)',
      backdropFilter: 'blur(18px)',
      borderRadius: 18,
      ...style,
    }}
  >
    {children}
  </div>
);

const Button: React.FC<React.PropsWithChildren<{kind?: 'primary' | 'secondary' | 'danger' | 'ghost'; style?: React.CSSProperties}>> = ({children, kind = 'secondary', style}) => {
  const background = kind === 'primary'
    ? 'linear-gradient(180deg, rgba(33,125,255,.95), rgba(54,78,232,.95))'
    : kind === 'danger'
      ? 'rgba(96,18,55,.42)'
      : kind === 'ghost'
        ? 'rgba(255,255,255,.025)'
        : 'rgba(9,24,52,.7)';
  const border = kind === 'primary'
    ? '1px solid rgba(102,239,255,.88)'
    : kind === 'danger'
      ? '1px solid rgba(255,100,166,.55)'
      : '1px solid rgba(116,185,255,.28)';
  return (
    <button
      type="button"
      style={{
        height: 42,
        padding: '0 16px',
        borderRadius: 12,
        border,
        background,
        color: TEXT,
        fontFamily: 'Arial, sans-serif',
        fontSize: 15,
        letterSpacing: 0.2,
        boxShadow: kind === 'primary' ? '0 0 28px rgba(42,127,255,.35)' : 'none',
        ...style,
      }}
    >
      {children}
    </button>
  );
};

const Metric: React.FC<{label: string; value: string; tone?: string}> = ({label, value, tone = CYAN}) => (
  <Glass style={{height: 56, minWidth: 132, borderRadius: 14, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px'}}>
    <div style={{width: 10, height: 10, borderRadius: 999, background: tone, boxShadow: `0 0 14px ${tone}`}} />
    <div>
      <div style={{fontFamily: 'Arial, sans-serif', color: MUTED, fontSize: 11}}>{label}</div>
      <div style={{fontFamily: 'Arial, sans-serif', color: TEXT, fontSize: 18, marginTop: 2}}>{value}</div>
    </div>
  </Glass>
);

const Sidebar: React.FC<{active?: string; guest?: boolean}> = ({active = 'Explore', guest = false}) => {
  const items = ['Explore', 'My View', 'Verified', 'Contested', 'Pending', 'Create Node', 'History'];
  return (
    <div style={{position: 'absolute', left: 16, top: 16, bottom: 16, width: 230}}>
      <Glass style={{height: '100%', padding: 16, display: 'flex', flexDirection: 'column'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 11, height: 58}}>
          <div style={{width: 38, height: 38, borderRadius: 999, border: '1px solid rgba(107,232,255,.55)', boxShadow: '0 0 20px rgba(85,236,255,.28)', display: 'grid', placeItems: 'center'}}>
            <div style={{width: 14, height: 14, borderRadius: 999, background: '#eefcff', boxShadow: '0 0 12px #fff, 0 0 26px rgba(85,236,255,.8)'}} />
          </div>
          <div style={{fontFamily: 'Arial, sans-serif', color: TEXT, fontWeight: 700, fontSize: 17, letterSpacing: 1.5}}>KNOWLEDGE BALL</div>
        </div>
        <div style={{height: 1, background: 'rgba(255,255,255,.07)', margin: '8px 0 14px'}} />
        <div style={{display: 'flex', flexDirection: 'column', gap: 7}}>
          {items.map((item) => {
            const on = item === active;
            return (
              <button
                type="button"
                key={item}
                style={{
                  height: 44,
                  padding: '0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderRadius: 12,
                  border: on ? '1px solid rgba(91,231,255,.56)' : '1px solid transparent',
                  background: on ? 'linear-gradient(90deg, rgba(23,117,166,.30), rgba(26,47,91,.28))' : 'transparent',
                  boxShadow: on ? '0 0 20px rgba(28,197,255,.11)' : 'none',
                  color: on ? '#effcff' : '#c2cad8',
                  fontFamily: 'Arial, sans-serif',
                  fontSize: 15,
                  textAlign: 'left',
                }}
              >
                <span style={{width: 18, color: item === 'Contested' ? LILAC : item === 'Pending' ? '#4b8fff' : CYAN}}>◌</span>{item}
              </button>
            );
          })}
        </div>
        <div style={{marginTop: 'auto'}}>
          <Glass style={{padding: 12, borderRadius: 14, display: 'flex', alignItems: 'center', gap: 10}}>
            <div style={{width: 38, height: 38, borderRadius: 999, border: '1px solid rgba(85,236,255,.58)', display: 'grid', placeItems: 'center', color: TEXT, fontFamily: 'Arial, sans-serif'}}>{guest ? 'G' : 'U'}</div>
            <div>
              <div style={{color: TEXT, fontFamily: 'Arial, sans-serif', fontSize: 14}}>{guest ? 'Guest' : 'User'}</div>
              <div style={{color: MUTED, fontFamily: 'Arial, sans-serif', fontSize: 11, marginTop: 3}}>{guest ? 'Read-only explorer' : 'Contributor'}</div>
            </div>
          </Glass>
        </div>
      </Glass>
    </div>
  );
};

const Topbar: React.FC<{energy?: string; total?: string; accuracy?: string}> = ({energy = '0', total = '0', accuracy = '0%'}) => (
  <div style={{position: 'absolute', left: 260, right: 16, top: 16, height: 72, display: 'flex', alignItems: 'center', gap: 10}}>
    <Glass style={{height: 56, flex: 1, borderRadius: 14, display: 'flex', alignItems: 'center', padding: '0 16px'}}>
      <span style={{color: '#d8e9ff', fontSize: 20, marginRight: 12}}>⌕</span>
      <span style={{color: MUTED, fontFamily: 'Arial, sans-serif', fontSize: 15}}>Search knowledge</span>
    </Glass>
    <Metric label="My Energy" value={energy} />
    <Metric label="Total Energy" value={total} tone={LILAC} />
    <Metric label="Accuracy" value={accuracy} tone="#67e6ff" />
    <Button kind="ghost" style={{height: 56}}>↻ Refresh</Button>
  </div>
);

const Base: React.FC<React.PropsWithChildren<{selected?: number}>> = ({children, selected}) => (
  <AbsoluteFill style={{background: BG}}>
    <Stars />
    <GraphBackdrop selected={selected} />
    {children}
  </AbsoluteFill>
);

export const KnowledgeBallUIExplore: React.FC = () => (
  <Base>
    <Sidebar active="Explore" />
    <Topbar />
    <Glass style={{position: 'absolute', right: 28, top: 112, width: 286, padding: 18}}>
      <div style={{color: TEXT, fontFamily: 'Arial, sans-serif', fontSize: 18, fontWeight: 700}}>Explore Knowledge</div>
      <div style={{color: MUTED, fontFamily: 'Arial, sans-serif', fontSize: 13, lineHeight: 1.55, marginTop: 9}}>Select any glowing knowledge node to inspect its definition, evidence, relations, validation state, and history.</div>
      <div style={{display: 'flex', gap: 8, marginTop: 16}}><Button kind="primary" style={{flex: 1}}>Open selected</Button><Button>Trace</Button></div>
    </Glass>
    <div style={{position: 'absolute', left: 260, right: 16, bottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
      <Glass style={{height: 48, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 12}}>
        <span style={{color: MUTED, fontFamily: 'Arial, sans-serif', fontSize: 12}}>View</span>
        <Button kind="ghost" style={{height: 34}}>−</Button><span style={{color: TEXT, fontFamily: 'Arial, sans-serif'}}>100%</span><Button kind="ghost" style={{height: 34}}>＋</Button>
      </Glass>
      <Button kind="primary" style={{height: 48, minWidth: 150}}>＋ Add Node</Button>
    </div>
  </Base>
);

export const KnowledgeBallUINode: React.FC = () => (
  <Base selected={18}>
    <Sidebar active="Explore" />
    <Topbar energy="12" total="0" accuracy="86%" />
    <Glass style={{position: 'absolute', right: 18, top: 102, bottom: 18, width: 340, padding: 18}}>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <div style={{color: MUTED, fontFamily: 'Arial, sans-serif', fontSize: 12, letterSpacing: 1.1}}>NODE DETAILS</div>
        <button type="button" style={{border: 0, background: 'transparent', color: '#d9e8ff', fontSize: 22}}>×</button>
      </div>
      <div style={{display: 'flex', gap: 11, alignItems: 'center', marginTop: 12}}>
        <div style={{width: 18, height: 18, borderRadius: 999, background: CYAN, boxShadow: '0 0 16px rgba(85,236,255,.8)'}} />
        <div>
          <div style={{color: TEXT, fontFamily: 'Arial, sans-serif', fontSize: 20, fontWeight: 700}}>Definition</div>
          <div style={{color: MUTED, fontFamily: 'Arial, sans-serif', fontSize: 11, marginTop: 3}}>KB-NODE-00482</div>
        </div>
        <div style={{marginLeft: 'auto', border: '1px solid rgba(85,236,255,.38)', color: CYAN, padding: '6px 9px', borderRadius: 9, fontFamily: 'Arial, sans-serif', fontSize: 11}}>VERIFIED</div>
      </div>
      <div style={{color: '#dce9f8', fontFamily: 'Arial, sans-serif', fontSize: 14, lineHeight: 1.6, marginTop: 18}}>A precise statement describing the meaning of a term or concept so that later claims can reference the same meaning.</div>
      <div style={{height: 1, background: 'rgba(255,255,255,.07)', margin: '18px 0'}} />
      <div style={{color: MUTED, fontFamily: 'Arial, sans-serif', fontSize: 11}}>RELATIONS</div>
      {['Depends on  ·  3', 'Supports  ·  7', 'Counterexamples  ·  1'].map((t, i) => (
        <button key={t} type="button" style={{width: '100%', height: 42, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, border: '1px solid rgba(116,185,255,.18)', background: 'rgba(255,255,255,.025)', color: '#dce8f8', padding: '0 12px', fontFamily: 'Arial, sans-serif', fontSize: 13}}><span><span style={{color: i === 2 ? LILAC : CYAN}}>●</span> &nbsp;{t}</span><span style={{color: MUTED}}>›</span></button>
      ))}
      <div style={{height: 1, background: 'rgba(255,255,255,.07)', margin: '18px 0'}} />
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}><Button>Trace</Button><Button>History</Button></div>
      <Button kind="primary" style={{width: '100%', marginTop: 9}}>Open full details</Button>
    </Glass>
  </Base>
);

export const KnowledgeBallUICreate: React.FC = () => (
  <Base>
    <Sidebar active="Create Node" />
    <Topbar energy="8" total="-8" accuracy="0%" />
    <Glass style={{position: 'absolute', left: 360, top: 112, width: 650, padding: 22}}>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <div>
          <div style={{color: TEXT, fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: 700}}>Create Knowledge Node</div>
          <div style={{color: MUTED, fontFamily: 'Arial, sans-serif', fontSize: 12, marginTop: 5}}>Creating a new node stakes 1 energy until validation resolves.</div>
        </div>
        <button type="button" style={{border: 0, background: 'transparent', color: '#d9e8ff', fontSize: 24}}>×</button>
      </div>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 18}}>
        <label style={{fontFamily: 'Arial, sans-serif', color: '#cbd8e9', fontSize: 12}}>Node type
          <select style={{width: '100%', height: 42, marginTop: 7, borderRadius: 10, border: '1px solid rgba(116,185,255,.22)', background: '#071128', color: TEXT, padding: '0 12px'}}><option>Definition</option><option>Fact</option><option>Theory</option><option>Reasoning</option><option>Counterexample</option></select>
        </label>
        <label style={{fontFamily: 'Arial, sans-serif', color: '#cbd8e9', fontSize: 12}}>Language
          <select style={{width: '100%', height: 42, marginTop: 7, borderRadius: 10, border: '1px solid rgba(116,185,255,.22)', background: '#071128', color: TEXT, padding: '0 12px'}}><option>English</option></select>
        </label>
      </div>
      <label style={{display: 'block', fontFamily: 'Arial, sans-serif', color: '#cbd8e9', fontSize: 12, marginTop: 14}}>Name
        <input placeholder="Unique node name" style={{width: '100%', boxSizing: 'border-box', height: 42, marginTop: 7, borderRadius: 10, border: '1px solid rgba(116,185,255,.22)', background: '#071128', color: TEXT, padding: '0 12px'}} />
      </label>
      <label style={{display: 'block', fontFamily: 'Arial, sans-serif', color: '#cbd8e9', fontSize: 12, marginTop: 14}}>Description
        <textarea placeholder="Describe the knowledge node clearly…" style={{width: '100%', boxSizing: 'border-box', height: 90, marginTop: 7, borderRadius: 10, border: '1px solid rgba(116,185,255,.22)', background: '#071128', color: TEXT, padding: 12, resize: 'none'}} />
      </label>
      <Glass style={{marginTop: 14, padding: 13, borderRadius: 12, background: 'rgba(35,43,91,.28)'}}>
        <div style={{color: '#dfe8ff', fontFamily: 'Arial, sans-serif', fontSize: 13}}>Validation state after submission</div>
        <div style={{color: MUTED, fontFamily: 'Arial, sans-serif', fontSize: 12, marginTop: 6, lineHeight: 1.5}}>The node enters a strong flashing pending state. Community approval or rejection votes each stake 1 energy.</div>
      </Glass>
      <div style={{display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18}}><Button kind="ghost">Cancel</Button><Button>Preview</Button><Button kind="primary">Stake 1 & Submit</Button></div>
    </Glass>
  </Base>
);

export const KnowledgeBallUIVote: React.FC = () => (
  <Base selected={45}>
    <Sidebar active="Pending" />
    <Topbar energy="5" total="-5" accuracy="61%" />
    <Glass style={{position: 'absolute', right: 20, top: 106, width: 365, padding: 20}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
        <div style={{width: 18, height: 18, borderRadius: 999, background: LILAC, boxShadow: '0 0 20px rgba(177,140,255,.85)'}} />
        <div style={{color: TEXT, fontFamily: 'Arial, sans-serif', fontSize: 20, fontWeight: 700}}>Pending validation</div>
      </div>
      <div style={{color: MUTED, fontFamily: 'Arial, sans-serif', fontSize: 12, marginTop: 8}}>Each vote stakes 1 energy. The first side to reach the required threshold resolves the node.</div>
      <Glass style={{marginTop: 16, padding: 14, borderRadius: 12}}>
        <div style={{display: 'flex', justifyContent: 'space-between', color: '#dce9f8', fontFamily: 'Arial, sans-serif', fontSize: 13}}><span>Required votes</span><span style={{color: TEXT, fontWeight: 700}}>4</span></div>
        <div style={{display: 'flex', justifyContent: 'space-between', color: '#dce9f8', fontFamily: 'Arial, sans-serif', fontSize: 13, marginTop: 10}}><span>Approve</span><span style={{color: CYAN}}>2 / 4</span></div>
        <div style={{height: 6, borderRadius: 999, background: 'rgba(255,255,255,.06)', marginTop: 7}}><div style={{width: '50%', height: '100%', borderRadius: 999, background: CYAN, boxShadow: '0 0 12px rgba(85,236,255,.6)'}} /></div>
        <div style={{display: 'flex', justifyContent: 'space-between', color: '#dce9f8', fontFamily: 'Arial, sans-serif', fontSize: 13, marginTop: 12}}><span>Reject</span><span style={{color: '#ff7da9'}}>1 / 4</span></div>
        <div style={{height: 6, borderRadius: 999, background: 'rgba(255,255,255,.06)', marginTop: 7}}><div style={{width: '25%', height: '100%', borderRadius: 999, background: '#ff6a9d', boxShadow: '0 0 12px rgba(255,106,157,.45)'}} /></div>
      </Glass>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16}}><Button style={{border: '1px solid rgba(85,236,255,.55)', color: CYAN}}>✓ Approve · 1</Button><Button kind="danger">✕ Reject · 1</Button></div>
      <Button kind="ghost" style={{width: '100%', marginTop: 10}}>View evidence & relations</Button>
    </Glass>
  </Base>
);

export const KnowledgeBallUILogin: React.FC = () => (
  <Base>
    <div style={{position: 'absolute', inset: 0, background: 'rgba(0,0,8,.42)', backdropFilter: 'blur(6px)'}} />
    <Sidebar active="Create Node" guest />
    <Topbar />
    <Glass style={{position: 'absolute', left: 430, top: 150, width: 500, padding: 28, textAlign: 'center'}}>
      <div style={{width: 64, height: 64, margin: '0 auto', borderRadius: 999, border: '1px solid rgba(102,239,255,.55)', display: 'grid', placeItems: 'center', boxShadow: '0 0 30px rgba(69,130,255,.25)', color: CYAN, fontSize: 28}}>◎</div>
      <div style={{color: TEXT, fontFamily: 'Arial, sans-serif', fontSize: 25, fontWeight: 700, marginTop: 16}}>Sign in to contribute</div>
      <div style={{color: MUTED, fontFamily: 'Arial, sans-serif', fontSize: 13, lineHeight: 1.55, marginTop: 9}}>Anyone can explore the public knowledge graph. Creating nodes, editing, and voting require an account.</div>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 22}}><Button kind="primary" style={{height: 48}}>Sign In</Button><Button style={{height: 48, border: '1px solid rgba(177,140,255,.55)'}}>Register</Button></div>
      <Button kind="ghost" style={{width: '100%', marginTop: 12}}>Continue exploring</Button>
    </Glass>
  </Base>
);
