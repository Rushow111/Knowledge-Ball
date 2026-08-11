import React from 'react';
import {Composition} from 'remotion';
import {KnowledgeBallPromo} from './KnowledgeBallPromo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="KnowledgeBall"
        component={KnowledgeBallPromo}
        durationInFrames={720}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  );
};
