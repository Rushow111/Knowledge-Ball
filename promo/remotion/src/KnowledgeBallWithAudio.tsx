import React from 'react';
import {AbsoluteFill, staticFile} from 'remotion';
import {Audio} from '@remotion/media';
import {KnowledgeBallPromo} from './KnowledgeBallPromo';

export const KnowledgeBallWithAudio: React.FC = () => {
  return (
    <AbsoluteFill>
      <KnowledgeBallPromo />
      <Audio
        src={staticFile('knowledge-ball-soundtrack.wav')}
        volume={0.92}
      />
    </AbsoluteFill>
  );
};
