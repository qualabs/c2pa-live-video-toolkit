import React, { useState } from 'react';
import styled from 'styled-components';
import { useC2paVideoJsPlayer } from '../hooks/useC2paVideoJsPlayer.js';
import { ChainOfTrust } from '../components/ChainOfTrust.js';
import { DataInspector } from '../components/DataInspector.js';
import { StreamControls } from '../components/StreamControls.js';
import { ManifestModal } from '../components/ManifestModal.js';
import type { SegmentRecord } from '@c2pa-live-toolkit/dashjs-c2pa-plugin';
import { DEFAULT_STREAM_URL } from '../constants.js';

/**
 * videojs-enhanced mode: dash.js + video.js + C2paPlayerUI overlays.
 * Demonstrates the full C2PA UI experience (colored progress bar, credentials
 * menu, friction modal) via @c2pa-live-toolkit/videojs-c2pa-ui.
 */
const VideoJsEnhancedDemo: React.FC = () => {
  const [streamUrl, setStreamUrl] = useState(DEFAULT_STREAM_URL);
  const [inputUrl, setInputUrl] = useState(DEFAULT_STREAM_URL);
  const [showManifestModal, setShowManifestModal] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<SegmentRecord | null>(null);

  const { containerRef, state, changeStream } = useC2paVideoJsPlayer(streamUrl);

  function handlePlay(): void {
    setStreamUrl(inputUrl);
    changeStream(inputUrl);
    try {
      window.history.replaceState(
        null, '',
        `${window.location.pathname}?url=${encodeURIComponent(inputUrl)}`,
      );
    } catch { /* ignore */ }
  }

  function handleStreamChange(url: string): void {
    setInputUrl(url);
    setStreamUrl(url);
    changeStream(url);
    setSelectedSegment(null);
  }

  return (
    <Container>
      <InputRow>
        <StreamInput
          aria-label="Stream URL"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handlePlay()}
          placeholder="Enter stream URL…"
        />
        <PlayButton onClick={handlePlay} disabled={!inputUrl}>
          ▶ Play
        </PlayButton>
      </InputRow>

      <TwoColumnLayout>
        <LeftColumn>
          {/* video.js mounts here — <video> is created imperatively inside the hook */}
          <VideoWrapper ref={containerRef} />

          <ChainOfTrust
            segments={state.segments}
            initData={state.initData}
            selectedSegment={selectedSegment}
            onSegmentSelect={setSelectedSegment}
          />
        </LeftColumn>

        <RightColumn>
          <StreamControls
            segments={state.segments}
            currentStreamUrl={streamUrl}
            onValidateManifest={() => setShowManifestModal(true)}
            onStreamChange={handleStreamChange}
          />
          <DataInspector segment={selectedSegment} />
        </RightColumn>
      </TwoColumnLayout>

      <ManifestModal
        isOpen={showManifestModal}
        manifest={null}
        initData={state.initData}
        onClose={() => setShowManifestModal(false)}
      />
    </Container>
  );
};

export default VideoJsEnhancedDemo;

const Container = styled.div`display: flex; flex-direction: column; gap: 1rem; width: 100%;`;

const InputRow = styled.div`display: flex; gap: 0.5rem; align-items: stretch;`;

const StreamInput = styled.input`
  flex: 1; padding: 0.75rem; background: #2d2d2d; border: 1px solid #4a4a4a;
  border-radius: 6px; color: #e5e5e5; font-size: 0.875rem;
  &::placeholder { color: #888; }
  &:focus { outline: none; border-color: #5a5a5a; }
`;

const PlayButton = styled.button`
  padding: 0.75rem 1.5rem; background: #2d2d2d; border: 1px solid #4a4a4a;
  border-radius: 8px; color: #e5e5e5; cursor: pointer; font-size: 0.875rem; font-weight: 500;
  transition: all 0.2s ease; white-space: nowrap;
  &:hover:not(:disabled) { background: #353535; border-color: #5a5a5a; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const TwoColumnLayout = styled.div`
  display: grid; grid-template-columns: 1.85fr 1fr; gap: 1.5rem; width: 100%;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;

const LeftColumn = styled.div`display: flex; flex-direction: column; gap: 1rem; width: 100%; min-width: 0;`;

const RightColumn = styled.div`display: flex; flex-direction: column; gap: 1.5rem; width: 100%; min-width: 0;`;

/* video.js con fluid:true crea su propio wrapper div con padding-top:56.25%
   dentro de VideoWrapper. Solo necesitamos width:100%. */
const VideoWrapper = styled.div`width: 100%;`;
