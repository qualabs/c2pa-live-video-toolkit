import React, { useState } from 'react';
import styled from 'styled-components';
import { useC2paPlayer } from '../hooks/useC2paPlayer.js';
import { DemoLayout } from './DemoLayout.js';
import { DEFAULT_STREAM_URL } from '../constants.js';

/**
 * dashjs-native mode: dash.js directly on <video>, no video.js.
 * Demonstrates the simplest possible integration via attachC2pa().
 */
const DashjsNativeDemo: React.FC = () => {
  const [streamUrl, setStreamUrl] = useState(DEFAULT_STREAM_URL);
  const { videoRef, state, changeStream } = useC2paPlayer(streamUrl);

  return (
    <DemoLayout
      playerSlot={<VideoEl ref={videoRef} playsInline muted />}
      state={state}
      streamUrl={streamUrl}
      onStreamChange={(url) => {
        setStreamUrl(url);
        changeStream(url);
      }}
    />
  );
};

export default DashjsNativeDemo;

const VideoEl = styled.video`
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
  border-radius: 8px;
  display: block;
`;
