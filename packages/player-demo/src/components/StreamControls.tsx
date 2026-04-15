import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import type { SegmentRecord, InitProcessedEvent } from '@c2pa-live-toolkit/dashjs-plugin';
import {
  injectGapAttack,
  injectOutOfOrderAttack,
  injectReplayAttack,
  injectMdatSwapAttack,
  disableAllAttacks,
  getCurrentSegmentNumber,
} from '../state/attackState.js';
import { DEFAULT_STREAM_URL } from '../constants.js';

const AD_MANIFEST_ENDPOINT = '/manifest';
const AD_STREAM_URL = '/stream_with_ad.mpd';
const STREAMER_RESTART_ENDPOINT = '/streamer/restart';

// Delays for the SSAI ad break sequence:
// - Wait for the streamer to restart and produce new init segment
// - Wait for the new manifest to be available before switching the player source
const STREAMER_RESTART_WAIT_MS = 5000;
const MANIFEST_FETCH_WAIT_MS = 2000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface StreamControlsProps {
  segments: SegmentRecord[];
  initData: InitProcessedEvent | null;
  currentStreamUrl?: string;
  onValidateManifest: () => void;
  onStreamChange: (url: string) => void;
}

export const StreamControls: React.FC<StreamControlsProps> = ({
  segments,
  initData,
  currentStreamUrl,
  onValidateManifest,
  onStreamChange,
}) => {
  const [attacksOpen, setAttacksOpen] = useState(false);
  const [isAdBreakActive, setIsAdBreakActive] = useState(false);
  const [isAdBreakLoading, setIsAdBreakLoading] = useState(false);

  const validationMethod: 'vsi' | 'manifestbox' | null = React.useMemo(() => {
    if (segments.length === 0 || initData == null) return null;
    return initData.sessionKeysCount > 0 ? 'vsi' : 'manifestbox';
  }, [segments, initData]);

  // Reset ad break state when stream returns to base
  useEffect(() => {
    if (currentStreamUrl?.includes(AD_STREAM_URL)) return;
    setIsAdBreakActive(false);
  }, [currentStreamUrl]);

  async function ensureBaseStream(): Promise<void> {
    setIsAdBreakActive(false);
    if (currentStreamUrl?.includes(AD_STREAM_URL)) {
      await disableAllAttacks();
      onStreamChange(DEFAULT_STREAM_URL);
    }
  }

  async function handleGapAttack(): Promise<void> {
    await ensureBaseStream();
    const ok = await injectGapAttack(1);
    alert(
      ok
        ? '✅ Gap attack ARMED!\n\nProxy will drop 1 segment. Watch Chain of Trust for: Missing Segment Detected'
        : '❌ Failed to inject gap attack. Is the proxy-server running on :8083?',
    );
  }

  async function handleOutOfOrderAttack(): Promise<void> {
    await ensureBaseStream();
    const ok = await injectOutOfOrderAttack(2);
    alert(
      ok
        ? '✅ Out-of-order attack ARMED!\n\nProxy will swap content of the next two segments.\nWatch Chain of Trust for: Reordered status'
        : '❌ Failed to inject out-of-order attack.',
    );
  }

  async function handleReplayAttack(): Promise<void> {
    await ensureBaseStream();
    const ok = await injectReplayAttack();
    alert(
      ok
        ? '✅ Replay attack ARMED!\n\nA valid segment will be re-injected verbatim.\nWatch Chain of Trust for: Replayed status'
        : '❌ Failed to inject replay attack.',
    );
  }

  async function handleMdatSwapAttack(): Promise<void> {
    await ensureBaseStream();
    const current = await getCurrentSegmentNumber();
    const ok = await injectMdatSwapAttack(3);
    alert(
      ok
        ? `✅ Mdat-swap attack ARMED!\n\nNext segment (after ${current ?? '?'}) will have its mdat replaced.\nWatch Chain of Trust for: Invalid (hash mismatch)`
        : '❌ Failed to inject mdat-swap attack.',
    );
  }

  async function handleSsaiAdBreak(): Promise<void> {
    setIsAdBreakActive(true);
    setIsAdBreakLoading(true);
    await disableAllAttacks();
    try {
      const restartResp = await fetch(STREAMER_RESTART_ENDPOINT, { method: 'POST' });
      if (!restartResp.ok) throw new Error(`Restart endpoint returned ${restartResp.status}`);
      await wait(STREAMER_RESTART_WAIT_MS);
      const manifestResp = await fetch(AD_MANIFEST_ENDPOINT);
      if (!manifestResp.ok) throw new Error(`Manifest endpoint returned ${manifestResp.status}`);
      await wait(MANIFEST_FETCH_WAIT_MS);
      onStreamChange(AD_STREAM_URL);
    } catch (error) {
      console.error('[StreamControls] Ad break failed:', error);
      setIsAdBreakActive(false);
    } finally {
      setIsAdBreakLoading(false);
    }
  }

  return (
    <Container>
      <TitleRow>
        <Title>Stream Controls</Title>
        {validationMethod && (
          <MethodBadge $method={validationMethod}>
            {validationMethod === 'vsi' ? '🔑 Session Keys (VSI)' : '📦 ManifestBox'}
          </MethodBadge>
        )}
      </TitleRow>

      <ControlsWrapper>
        {validationMethod === 'vsi' && (
          <ControlButton onClick={onValidateManifest}>
            <span>🔍</span>
            <span>Validate Init Segment</span>
          </ControlButton>
        )}

        <DropdownSection>
          <DropdownHeader onClick={() => setAttacksOpen(!attacksOpen)}>
            <span>🔒 Proxy Attack Scenarios</span>
            <span>{attacksOpen ? '▼' : '▶'}</span>
          </DropdownHeader>

          {attacksOpen && (
            <DropdownContent>
              <AttackButton $variant="danger" onClick={handleGapAttack}>
                <span>⊘</span> Gap (drop 1 segment)
              </AttackButton>
              <AttackButton $variant="warning" onClick={handleOutOfOrderAttack}>
                <span>↩️</span> Out-of-Order (+2)
              </AttackButton>
              <AttackButton $variant="warning" onClick={handleReplayAttack}>
                <span>⏪</span> Replay (full re-injection)
              </AttackButton>
              <AttackButton $variant="danger" onClick={handleMdatSwapAttack}>
                <span>🔀</span> Mdat-Swap (hash tamper)
              </AttackButton>
            </DropdownContent>
          )}
        </DropdownSection>

        <ControlButton onClick={handleSsaiAdBreak} disabled={isAdBreakActive || isAdBreakLoading}>
          <span>{isAdBreakLoading ? '⏳' : '📺'}</span>
          <span>{isAdBreakLoading ? 'Restarting stream…' : 'Simulate Ad Break'}</span>
        </ControlButton>
      </ControlsWrapper>
    </Container>
  );
};

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
`;
const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
`;
const Title = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: #e5e5e5;
  margin: 0;
`;
const MethodBadge = styled.span<{ $method: 'vsi' | 'manifestbox' }>`
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: ${(p) => (p.$method === 'vsi' ? '#1a3a2a' : '#2a2a3a')};
  color: ${(p) => (p.$method === 'vsi' ? '#4ade80' : '#818cf8')};
  border: 1px solid ${(p) => (p.$method === 'vsi' ? '#2d6a4a' : '#4a4a7a')};
`;
const ControlsWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;
const ControlButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: #2d2d2d;
  border: 1px solid #4a4a4a;
  border-radius: 8px;
  color: #e5e5e5;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.875rem;
  font-weight: 500;
  &:hover:not(:disabled) {
    background: #353535;
    border-color: #5a5a5a;
  }
  &:disabled {
    opacity: 0.7;
    cursor: default;
  }
`;
const DropdownSection = styled.div`
  background: #1e1e1e;
  border: 1px solid #4a4a4a;
  border-radius: 8px;
  overflow: hidden;
`;
const DropdownHeader = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  background: #2d2d2d;
  border: none;
  color: #e5e5e5;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background 0.2s ease;
  &:hover {
    background: #353535;
  }
`;
const DropdownContent = styled.div`
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;
const AttackButton = styled.button<{ $variant: 'danger' | 'warning' }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: ${(p) => (p.$variant === 'danger' ? '#4a2d2d' : '#3a3a3a')};
  border: 1px solid ${(p) => (p.$variant === 'danger' ? '#6a4a4a' : '#555')};
  border-radius: 6px;
  color: #e5e5e5;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s ease;
  &:hover {
    background: ${(p) => (p.$variant === 'danger' ? '#5a3d3d' : '#454545')};
  }
`;
