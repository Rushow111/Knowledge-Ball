import {gunzipSync} from 'node:zlib';
import {readFileSync, writeFileSync} from 'node:fs';

const payload = [1,2,3,4]
  .map((i) => readFileSync(`scripts/v3-payload/part${i}.txt`, 'utf8').trim())
  .join('');

writeFileSync('src/KnowledgeBallLong.tsx', gunzipSync(Buffer.from(payload, 'base64')));
writeFileSync('src/Root.tsx', `import React from 'react';
import {Composition} from 'remotion';
import {KnowledgeBallPromo} from './KnowledgeBallPromo';
import {KnowledgeBallLong} from './KnowledgeBallLong';

export const RemotionRoot: React.FC = () => (<>
  <Composition id="KnowledgeBall" component={KnowledgeBallPromo} durationInFrames={720} fps={30} width={1280} height={720} />
  <Composition id="KnowledgeBall5Min" component={KnowledgeBallLong} durationInFrames={9000} fps={30} width={1080} height={1920} />
</>);
`);
console.log('Built cinematic script-driven vertical Knowledge Ball film source V3.');
