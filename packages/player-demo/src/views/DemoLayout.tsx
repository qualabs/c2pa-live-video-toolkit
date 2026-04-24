import React, { useState } from 'react';
import styled from 'styled-components';
import { ChainOfTrust } from '../components/ChainOfTrust.js';
import { DataInspector } from '../components/DataInspector.js';
import { StreamControls } from '../components/StreamControls.js';
import { ManifestModal } from '../components/ManifestModal.js';
import type { C2paPlayerState } from '../hooks/useC2paPlayer.js';
import type { SegmentRecord } from '@qualabs/c2pa-live-dashjs-plugin';
import { DEFAULT_STREAM_URL } from '../constants.js';

interface DemoLayoutProps {
  /** The video player element (a <video> or <div> mount point) for the left column */
  playerSlot: React.ReactNode;
  state: C2paPlayerState;
  streamUrl: string;
  onStreamChange: (url: string) => void;
  /** Initial value for the URL input field. Defaults to DEFAULT_STREAM_URL. */
  initialUrl?: string;
}

/**
 * Shared layout for both demo modes (dashjs-native and videojs-enhanced).
 * Owns the URL input bar, two-column grid, panel slots, and manifest modal state.
 * Only the player element in the left column differs between modes.
 */
export const DemoLayout: React.FC<DemoLayoutProps> = ({
  playerSlot,
  state,
  streamUrl,
  onStreamChange,
  initialUrl = DEFAULT_STREAM_URL,
}) => {
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [showManifestModal, setShowManifestModal] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<SegmentRecord | null>(null);

  function handlePlay(): void {
    onStreamChange(inputUrl);
    // Best-effort URL update for shareability — History API may be unavailable (e.g. file://)
    try {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}?url=${encodeURIComponent(inputUrl)}`,
      );
    } catch {
      /* History API unavailable, URL update skipped */
    }
  }

  function handleStreamChange(url: string): void {
    setInputUrl(url);
    onStreamChange(url);
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
          {playerSlot}
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
            initData={state.initData}
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

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
`;

const InputRow = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: stretch;
`;

const StreamInput = styled.input`
  flex: 1;
  padding: 0.75rem;
  background: #2d2d2d;
  border: 1px solid #4a4a4a;
  border-radius: 6px;
  color: #e5e5e5;
  font-size: 0.875rem;
  &::placeholder {
    color: #888;
  }
  &:focus {
    outline: none;
    border-color: #5a5a5a;
  }
`;

const PlayButton = styled.button`
  padding: 0.75rem 1.5rem;
  background: #2d2d2d;
  border: 1px solid #4a4a4a;
  border-radius: 8px;
  color: #e5e5e5;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: all 0.2s ease;
  white-space: nowrap;
  &:hover:not(:disabled) {
    background: #353535;
    border-color: #5a5a5a;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const TwoColumnLayout = styled.div`
  display: grid;
  grid-template-columns: 1.85fr 1fr;
  gap: 1.5rem;
  width: 100%;
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const LeftColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  min-width: 0;
`;

const RightColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  min-width: 0;
`;
