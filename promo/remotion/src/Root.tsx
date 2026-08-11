import React from 'react';
import {Composition} from 'remotion';
import {KnowledgeBallWithAudio} from './KnowledgeBallWithAudio';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="KnowledgeBall"
        component={KnowledgeBallWithAudio}
        durationInFrames={720}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  );
};
