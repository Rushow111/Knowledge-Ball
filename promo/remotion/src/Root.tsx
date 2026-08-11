import React from 'react';
import {Composition} from 'remotion';
import {KnowledgeBallPromo} from './KnowledgeBallPromo';
import {KnowledgeBallLong} from './KnowledgeBallLong';

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
      <Composition
        id="KnowledgeBall5Min"
        component={KnowledgeBallLong}
        durationInFrames={9000}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  );
};
