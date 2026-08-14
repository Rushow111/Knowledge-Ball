import React from 'react';
import {Composition, Still} from 'remotion';
import {KnowledgeBallPromo} from './KnowledgeBallPromo';
import {
  KnowledgeBallUIExplore,
  KnowledgeBallUINode,
  KnowledgeBallUICreate,
  KnowledgeBallUIVote,
  KnowledgeBallUILogin,
} from './KnowledgeBallUI';

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
      <Still id="KnowledgeBallUIExplore" component={KnowledgeBallUIExplore} width={1280} height={720} />
      <Still id="KnowledgeBallUINode" component={KnowledgeBallUINode} width={1280} height={720} />
      <Still id="KnowledgeBallUICreate" component={KnowledgeBallUICreate} width={1280} height={720} />
      <Still id="KnowledgeBallUIVote" component={KnowledgeBallUIVote} width={1280} height={720} />
      <Still id="KnowledgeBallUILogin" component={KnowledgeBallUILogin} width={1280} height={720} />
    </>
  );
};
