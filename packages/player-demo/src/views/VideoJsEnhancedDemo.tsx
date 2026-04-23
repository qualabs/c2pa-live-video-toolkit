import React, { useState } from 'react';
import styled from 'styled-components';
import { useC2paVideoJsPlayer } from '../hooks/useC2paVideoJsPlayer.js';
import { DemoLayout } from './DemoLayout.js';
import { DEFAULT_STREAM_URL } from '../constants.js';

/**
 * videojs-enhanced mode: dash.js + video.js + C2paPlayerUI overlays.
 * Demonstrates the full C2PA UI experience (colored progress bar, credentials
 * menu, friction modal) via @qualabs/c2pa-live-videojs-ui.
 *
 * Note: video.js with fluid:true creates its own wrapper div with padding-top:56.25%
 * for a 16:9 ratio. VideoWrapper only needs width:100%.
 */
const VideoJsEnhancedDemo: React.FC = () => {
  const [streamUrl, setStreamUrl] = useState(DEFAULT_STREAM_URL);
  const { containerRef, state, changeStream } = useC2paVideoJsPlayer(streamUrl);

  return (
    <DemoLayout
      playerSlot={<VideoWrapper ref={containerRef} />}
      state={state}
      streamUrl={streamUrl}
      onStreamChange={(url) => {
        setStreamUrl(url);
        changeStream(url);
      }}
    />
  );
};

export default VideoJsEnhancedDemo;

const VideoWrapper = styled.div`
  width: 100%;
`;
