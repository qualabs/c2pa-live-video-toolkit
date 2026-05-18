import React from 'react';
import styled from 'styled-components';
import type { SegmentRecord, InitProcessedEvent } from '@qualabs/c2pa-live-dashjs-plugin';

interface StreamControlsProps {
  segments: SegmentRecord[];
  initData: InitProcessedEvent | null;
  onValidateManifest: () => void;
}

/**
 * Extracts a human-readable signing organization from the C2PA manifest.
 * Prefers the X.509 certificate issuer (signatureInfo.issuer); falls back to claimGenerator.
 */
function getSigningOrg(initData: InitProcessedEvent | null, segments: SegmentRecord[]): string | null {
  const manifest = initData?.manifest ?? segments.find((s) => s.manifest)?.manifest ?? null;
  if (!manifest) return null;
  const issuer = manifest.signatureInfo?.issuer?.trim();
  if (issuer) return issuer;
  const claimGenerator = manifest.claimGenerator?.trim();
  if (claimGenerator) return claimGenerator;
  return null;
}

export const StreamControls: React.FC<StreamControlsProps> = ({
  segments,
  initData,
  onValidateManifest,
}) => {
  const validationMethod: 'vsi' | 'manifestbox' | null = React.useMemo(() => {
    if (segments.length === 0 || initData == null) return null;
    return initData.sessionKeysCount > 0 ? 'vsi' : 'manifestbox';
  }, [segments, initData]);

  const signingOrg = React.useMemo(() => getSigningOrg(initData, segments), [initData, segments]);

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

      {signingOrg && (
        <SignedByCard>
          <SignedByLabel>Signed by</SignedByLabel>
          <SignedByValue title={signingOrg}>{signingOrg}</SignedByValue>
        </SignedByCard>
      )}

      <ControlsWrapper>
        {validationMethod === 'vsi' && (
          <ControlButton onClick={onValidateManifest}>
            <span>🔍</span>
            <span>Validate Init Segment</span>
          </ControlButton>
        )}
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
const SignedByCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
  background: rgba(74, 222, 128, 0.08);
  border: 1px solid rgba(74, 222, 128, 0.25);
  border-radius: 8px;
`;
const SignedByLabel = styled.span`
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #4ade80;
`;
const SignedByValue = styled.span`
  font-size: 0.95rem;
  font-weight: 500;
  color: #e5e5e5;
  word-break: break-word;
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
