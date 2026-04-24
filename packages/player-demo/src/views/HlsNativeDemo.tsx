import React, { useState } from 'react';
import styled from 'styled-components';
import Hls from 'hls.js';
import { useC2paHlsPlayer } from '../hooks/useC2paHlsPlayer.js';
import { DemoLayout } from './DemoLayout.js';
import { DEFAULT_HLS_STREAM_URL } from '../constants.js';

/**
 * hls-native mode: hls.js directly on <video>, no video.js.
 * Demonstrates the simplest possible integration via attachC2pa() for HLS.
 *
 * CMAF only: C2PA validation requires fMP4/CMAF segments (#EXT-X-MAP + .m4s).
 * Safari caveat: When Safari uses its native HLS engine, hls.js loaders are
 * bypassed and C2PA validation is unavailable.
 */
const HlsNativeDemo: React.FC = () => {
  const [streamUrl, setStreamUrl] = useState(DEFAULT_HLS_STREAM_URL);
  const { videoRef, state, changeStream } = useC2paHlsPlayer(streamUrl);

  return (
    <>
      {!Hls.isSupported() && (
        <SafariBanner>
          Safari is using its native HLS engine — C2PA validation is unavailable in this mode. Use
          Chrome or Firefox for full validation.
        </SafariBanner>
      )}
      <DemoLayout
        playerSlot={<VideoEl ref={videoRef} playsInline muted autoPlay />}
        state={state}
        streamUrl={streamUrl}
        initialUrl={DEFAULT_HLS_STREAM_URL}
        onStreamChange={(url) => {
          setStreamUrl(url);
          changeStream(url);
        }}
      />
    </>
  );
};

export default HlsNativeDemo;

const VideoEl = styled.video`
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
  border-radius: 8px;
  display: block;
`;

const SafariBanner = styled.div`
  padding: 0.75rem 1rem;
  background: #3a2a00;
  border: 1px solid #8a6000;
  border-radius: 6px;
  color: #ffd966;
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
`;
