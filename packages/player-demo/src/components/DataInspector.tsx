import React, { useState } from 'react';
import styled from 'styled-components';
import type { SegmentRecord, SegmentStatus } from '@c2pa-live-toolkit/dashjs-c2pa-plugin';
import { ERROR_CODE_MESSAGES } from '@c2pa-live-toolkit/dashjs-c2pa-plugin';

interface DataInspectorProps {
  segment: SegmentRecord | null;
}

const ALG_NAMES: Record<number, string> = {
  [-7]: 'ES256', [-35]: 'ES384', [-36]: 'ES512', [-8]: 'EdDSA',
};

function isBufferLike(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  if (obj instanceof Uint8Array) return true;
  const keys = Object.keys(obj as object);
  if (keys.length === 0) return false;
  return (
    keys.every((k) => /^\d+$/.test(k)) &&
    keys.every((k) => typeof (obj as Record<string, unknown>)[k] === 'number')
  );
}

function bytesToHex(bytes: unknown): string {
  if (!bytes) return '';
  const arr =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(Object.values(bytes as Record<string, number>));
  return '0x' + Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function convertBuffersToHex(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (isBufferLike(obj)) return bytesToHex(obj);
  if (Array.isArray(obj)) return obj.map(convertBuffersToHex);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj as object)) {
      result[key] = convertBuffersToHex((obj as Record<string, unknown>)[key]);
    }
    return result;
  }
  return obj;
}

type StatusInfo = {
  title: string;
  description: string;
  details: string[];
  color: string;
  meaning: string;
};

function buildStatusInfo(status: SegmentStatus, errorCodes: string[]): StatusInfo {
  switch (status) {
    case 'valid':
      return {
        title: 'Valid Segment',
        description: 'This segment passed all C2PA validation checks.',
        details: [
          '✓ Cryptographic signature is valid',
          '✓ Content hash matches the signed hash',
          '✓ Sequence number is correct',
          '✓ Segment has not been tampered with',
        ],
        color: '#4ade80',
        meaning: 'The video segment is authentic and has not been modified since it was signed.',
      };
    case 'invalid': {
      const reasons = errorCodes.map((code) => `✗ ${ERROR_CODE_MESSAGES[code] ?? code}`);
      return {
        title: 'Invalid Segment',
        description: 'This segment failed one or more C2PA validation checks.',
        details: reasons.length > 0 ? reasons : ['✗ One or more validation checks failed'],
        color: '#ef4444',
        meaning: 'The segment failed cryptographic validation. The content may have been tampered with.',
      };
    }
    case 'replayed':
      return {
        title: 'Replayed Segment',
        description:
          'A complete, valid segment was re-injected verbatim. Its sequenceNumber is outside the acceptable live window.',
        details: [
          'Signature and hash succeed — failure occurs via temporal monotonicity',
          'sequenceNumber < minSequenceNumber → livevideo.segment.invalid',
          'Not a gap attack: no stall, seamless playback',
        ],
        color: '#f97316',
        meaning: 'Authenticity does not imply freshness. Replay is detected via sequence number monotonicity.',
      };
    case 'reordered':
      return {
        title: 'Reordered Segment',
        description: 'This segment was delivered out of sequence.',
        details: ['↩ Segment content swapped with a neighboring segment', '✗ BMFF hash mismatch detected'],
        color: '#f59e0b',
        meaning: 'Could be a network condition or an intentional reordering attack.',
      };
    case 'missing':
      return {
        title: 'Missing Segment Detected',
        description: 'This segment was dropped from the live stream.',
        details: ['⊘ Segment not delivered (gap attack or network loss)', '⚠ Gap in sequence detected'],
        color: '#eab308',
        meaning: 'One or more segments were dropped. Could indicate a gap attack or network failure.',
      };
    case 'warning':
      return {
        title: 'Warning',
        description: 'Segment has potential issues but may still be playable.',
        details: ['⚠ Some validation checks could not be completed'],
        color: '#fbbf24',
        meaning: 'Segment could not be fully verified. May be normal for certain content types.',
      };
  }
}

function statusIcon(status: SegmentStatus): string {
  switch (status) {
    case 'valid':     return '✓';
    case 'replayed':  return '♻';
    case 'reordered': return '↩';
    case 'missing':   return '⊘';
    case 'invalid':   return '✗';
    case 'warning':   return '⚠';
  }
}

export const DataInspector: React.FC<DataInspectorProps> = ({ segment }) => {
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'data' | 'info'>('data');

  if (!segment) {
    return (
      <Container>
        <Title>Data Inspector</Title>
        <EmptyState>Select a segment from the Chain of Trust table to inspect its data</EmptyState>
      </Container>
    );
  }

  const errorCodes = (segment.validationResults?.errorCodes ?? []) as string[];
  const info = buildStatusInfo(segment.status, errorCodes);
  const displayData = convertBuffersToHex({
    segmentNumber: segment.segmentNumber,
    sequenceNumber: segment.sequenceNumber,
    mediaType: segment.mediaType,
    keyId: segment.keyId,
    hash: segment.hash,
    status: segment.status,
    sequenceReason: segment.sequenceReason,
    validationResults: segment.validationResults,
  });

  return (
    <>
      <Container>
        <Title>Data Inspector</Title>
        <PreviewCard onClick={() => setShowModal(true)}>
          <PreviewHeader>
            <PreviewTitle>Segment #{segment.segmentNumber}</PreviewTitle>
            <StatusBadge $status={segment.status}>
              {statusIcon(segment.status)} {segment.status.toUpperCase()}
            </StatusBadge>
          </PreviewHeader>
          <PreviewInfo>
            <InfoRow><InfoLabel>SEQ:</InfoLabel><InfoValue>{segment.sequenceNumber}</InfoValue></InfoRow>
            <InfoRow><InfoLabel>Type:</InfoLabel><InfoValue>{segment.mediaType}</InfoValue></InfoRow>
            <InfoRow><InfoLabel>Key ID:</InfoLabel><InfoValue>{segment.keyId.substring(0, 16)}…</InfoValue></InfoRow>
          </PreviewInfo>
          <ClickHint>Click to view details</ClickHint>
        </PreviewCard>
      </Container>

      {showModal && (
        <ModalOverlay onClick={() => setShowModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Segment #{segment.segmentNumber}</ModalTitle>
              <CloseButton onClick={() => setShowModal(false)}>✕</CloseButton>
            </ModalHeader>
            <ModalTabs>
              <Tab $active={activeTab === 'data'} onClick={() => setActiveTab('data')}>Segment Data</Tab>
              <Tab $active={activeTab === 'info'} onClick={() => setActiveTab('info')}>Info</Tab>
            </ModalTabs>
            <ModalBody>
              {activeTab === 'data' ? (
                <JsonViewer>
                  <pre>{JSON.stringify(displayData, null, 2)}</pre>
                </JsonViewer>
              ) : (
                <InfoPanel>
                  <InfoTitle style={{ color: info.color }}>
                    {statusIcon(segment.status)} {info.title}
                  </InfoTitle>
                  <InfoDescription>{info.description}</InfoDescription>
                  <DetailsList>
                    {info.details.map((d, i) => <DetailItem key={i}>{d}</DetailItem>)}
                  </DetailsList>
                  <MeaningBox>
                    <MeaningTitle>What does this mean?</MeaningTitle>
                    <MeaningText>{info.meaning}</MeaningText>
                  </MeaningBox>
                </InfoPanel>
              )}
            </ModalBody>
          </ModalContent>
        </ModalOverlay>
      )}
    </>
  );
};

// Algmap export for potential reuse
export { ALG_NAMES };

const Container = styled.div`display: flex; flex-direction: column; gap: 1rem; width: 100%;`;
const Title = styled.h2`font-size: 1.25rem; font-weight: 600; color: #e5e5e5; margin: 0;`;
const EmptyState = styled.div`
  background: #1e1e1e; border: 1px solid #4a4a4a; border-radius: 8px;
  padding: 3rem 1rem; text-align: center; color: #888; font-size: 0.875rem;
`;
const PreviewCard = styled.div`
  background: #1e1e1e; border: 1px solid #4a4a4a; border-radius: 8px;
  padding: 1rem; cursor: pointer; transition: all 0.2s ease;
  &:hover { border-color: #5a5a5a; background: #252525; }
`;
const PreviewHeader = styled.div`display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;`;
const PreviewTitle = styled.h3`font-size: 1rem; font-weight: 600; color: #e5e5e5; margin: 0;`;
const StatusBadge = styled.span<{ $status: SegmentStatus }>`
  font-size: 0.75rem; font-weight: 600; padding: 0.25rem 0.5rem; border-radius: 4px;
  color: ${(p) => p.$status === 'valid' ? '#4ade80' : p.$status === 'invalid' || p.$status === 'replayed' || p.$status === 'reordered' ? '#ef4444' : '#fbbf24'};
`;
const PreviewInfo = styled.div`display: flex; flex-direction: column; gap: 0.5rem;`;
const InfoRow = styled.div`display: flex; justify-content: space-between; align-items: center;`;
const InfoLabel = styled.span`color: #a0a0a0; font-size: 0.875rem; font-weight: 500;`;
const InfoValue = styled.span`color: #e5e5e5; font-size: 0.875rem; font-family: 'Courier New', monospace;`;
const ClickHint = styled.div`
  margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid #333;
  text-align: center; color: #888; font-size: 0.75rem;
`;
const ModalOverlay = styled.div`
  position: fixed; inset: 0; background: rgba(0,0,0,0.75);
  display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem;
`;
const ModalContent = styled.div`
  background: #1e1e1e; border: 1px solid #4a4a4a; border-radius: 12px;
  width: 100%; max-width: 800px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;
`;
const ModalHeader = styled.div`
  display: flex; justify-content: space-between; align-items: center;
  padding: 1.5rem; border-bottom: 1px solid #4a4a4a;
`;
const ModalTitle = styled.h2`font-size: 1.25rem; font-weight: 600; color: #e5e5e5; margin: 0;`;
const CloseButton = styled.button`
  background: transparent; border: none; color: #a0a0a0; font-size: 1.5rem;
  cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center;
  justify-content: center; border-radius: 4px; transition: all 0.2s ease;
  &:hover { background: #2d2d2d; color: #e5e5e5; }
`;
const ModalTabs = styled.div`display: flex; border-bottom: 1px solid #4a4a4a; background: #252525;`;
const Tab = styled.button<{ $active: boolean }>`
  flex: 1; padding: 1rem; background: ${(p) => p.$active ? '#1e1e1e' : 'transparent'};
  border: none; border-bottom: 2px solid ${(p) => p.$active ? '#4ade80' : 'transparent'};
  color: ${(p) => p.$active ? '#e5e5e5' : '#a0a0a0'};
  font-weight: ${(p) => p.$active ? '600' : '400'}; font-size: 0.875rem; cursor: pointer;
  transition: all 0.2s ease; &:hover { background: #2d2d2d; color: #e5e5e5; }
`;
const ModalBody = styled.div`
  flex: 1; overflow-y: auto; padding: 1.5rem;
  &::-webkit-scrollbar { width: 8px; }
  &::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }
`;
const JsonViewer = styled.div`
  background: #0d0d0d; border: 1px solid #333; border-radius: 6px; padding: 1rem;
  pre { margin: 0; color: #e5e5e5; font-family: 'Courier New', monospace; font-size: 0.875rem; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
`;
const InfoPanel = styled.div`display: flex; flex-direction: column; gap: 1.5rem;`;
const InfoTitle = styled.h3`font-size: 1.25rem; font-weight: 600; margin: 0; text-align: center;`;
const InfoDescription = styled.p`font-size: 1rem; color: #a0a0a0; margin: 0; text-align: center; line-height: 1.6;`;
const DetailsList = styled.ul`list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.75rem;`;
const DetailItem = styled.li`
  font-size: 0.9375rem; color: #e5e5e5; padding: 0.75rem;
  background: #252525; border-left: 3px solid #4a4a4a; border-radius: 4px; line-height: 1.5;
`;
const MeaningBox = styled.div`background: #252525; border: 1px solid #333; border-radius: 8px; padding: 1.25rem;`;
const MeaningTitle = styled.h4`font-size: 1rem; font-weight: 600; color: #4ade80; margin: 0 0 0.75rem 0;`;
const MeaningText = styled.p`font-size: 0.9375rem; color: #d0d0d0; margin: 0; line-height: 1.6;`;
