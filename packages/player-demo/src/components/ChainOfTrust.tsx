import React from 'react';
import styled from 'styled-components';
import type { SegmentRecord, InitProcessedEvent } from '@c2pa-live-toolkit/dashjs-plugin';
import { ValidationErrorCode, SegmentStatus } from '@c2pa-live-toolkit/dashjs-plugin';
import { statusIcon, statusText, statusCategory } from '../utils/segmentStatusUtils.js';

interface ChainOfTrustProps {
  segments: SegmentRecord[];
  initData: InitProcessedEvent | null;
  selectedSegment: SegmentRecord | null;
  onSegmentSelect: (segment: SegmentRecord) => void;
}

// Height of the sticky <thead> row — InitRow sticks just below it
const HEADER_ROW_HEIGHT = '37px';
const TABLE_MAX_HEIGHT = '340px';
const KEY_ID_TRUNCATE_LENGTH = 8;

function truncate(value: string | undefined | null, length = KEY_ID_TRUNCATE_LENGTH): string {
  if (!value) return '—';
  return value.substring(0, length) + '...';
}

const ValidationBadgeKind = {
  VALID: 'valid',
  FAILED: 'failed',
  WARNING: 'warning',
  EMPTY: 'empty',
  PENDING: 'pending',
} as const;

type ValidationBadgeKindValue = (typeof ValidationBadgeKind)[keyof typeof ValidationBadgeKind];

const VALIDATION_BADGE_LABEL: Record<ValidationBadgeKindValue, string> = {
  [ValidationBadgeKind.VALID]: 'VALID',
  [ValidationBadgeKind.FAILED]: 'NOT VALID',
  [ValidationBadgeKind.WARNING]: 'MISSING SEGMENT',
  [ValidationBadgeKind.EMPTY]: '—',
  [ValidationBadgeKind.PENDING]: 'PENDING',
};

const InitBadgeStatus = {
  VALID: ValidationBadgeKind.VALID,
  FAILED: ValidationBadgeKind.FAILED,
  PENDING: ValidationBadgeKind.PENDING,
} as const;

type InitBadgeStatusValue = (typeof InitBadgeStatus)[keyof typeof InitBadgeStatus];

function lacksC2paData(segment: SegmentRecord): boolean {
  return segment.status === SegmentStatus.UNVERIFIED;
}

function resolveValidationBadge(segment: SegmentRecord): ValidationBadgeKindValue {
  if (segment.status === SegmentStatus.UNVERIFIED) return ValidationBadgeKind.EMPTY;
  if (segment.status === SegmentStatus.WARNING) return ValidationBadgeKind.WARNING;
  return segment.status === SegmentStatus.VALID
    ? ValidationBadgeKind.VALID
    : ValidationBadgeKind.FAILED;
}

function resolveInitBadgeStatus(initData: InitProcessedEvent | null): InitBadgeStatusValue {
  if (initData == null) return InitBadgeStatus.PENDING;
  return initData.success ? InitBadgeStatus.VALID : InitBadgeStatus.FAILED;
}

export const ChainOfTrust: React.FC<ChainOfTrustProps> = ({
  segments,
  initData,
  selectedSegment,
  onSegmentSelect,
}) => {
  const sortedSegments = React.useMemo(
    () => [...segments].sort((a, b) => b.timestamp - a.timestamp),
    [segments],
  );

  const validCount = segments.filter((s) => s.status === SegmentStatus.VALID).length;
  const failedCount = segments.filter((s) => statusCategory(s.status) === 'failed').length;
  const warningCount = segments.filter((s) => statusCategory(s.status) === 'warning').length;

  const initStatus = resolveInitBadgeStatus(initData);
  const isManifestBox = !initData?.sessionKeysCount;

  return (
    <Container>
      <Header>
        <Title>Chain of Trust</Title>
        {segments.length > 0 && (
          <Stats>
            <Stat $color="#4ade80">✓ {validCount}</Stat>
            <Stat $color="#ef4444">✗ {failedCount}</Stat>
            <Stat $color="#fbbf24">⚠ {warningCount}</Stat>
          </Stats>
        )}
      </Header>

      <TableWrapper>
        <Table>
          <thead>
            <tr>
              <Th>SEG #</Th>
              <Th>TYPE</Th>
              <Th>SEQ</Th>
              <Th>{isManifestBox ? 'PREV MANIFEST' : 'KEY ID'}</Th>
              <Th>HASH</Th>
              <Th>VALIDATION</Th>
              <Th>STATUS</Th>
            </tr>
          </thead>
          <tbody>
            {/* Init segment — sticky just below the header row */}
            <InitRow>
              <Td>INIT</Td>
              <Td>init</Td>
              <Td>—</Td>
              <Td
                title={isManifestBox ? 'No previous manifest for init' : 'Initialization Segment'}
              >
                {isManifestBox ? '—' : 'Init Seg...'}
              </Td>
              <Td
                title={
                  initData?.sessionKeysCount ? 'Contains session keys' : 'Contains C2PA manifest'
                }
              >
                {initData?.sessionKeysCount ? 'Session Keys' : 'Manifest'}
              </Td>
              <Td>
                <ValidBadge $status={initStatus}>{VALIDATION_BADGE_LABEL[initStatus]}</ValidBadge>
              </Td>
              <Td>
                <StatusBadge
                  $category={
                    initStatus === InitBadgeStatus.VALID
                      ? 'valid'
                      : initStatus === InitBadgeStatus.FAILED
                        ? 'failed'
                        : 'warning'
                  }
                >
                  <span>🔑</span>
                  <span>Init</span>
                </StatusBadge>
              </Td>
              {isManifestBox && <Td>—</Td>}
            </InitRow>

            {sortedSegments.map((segment) => {
              const category = statusCategory(segment.status);
              const hasNoC2paData = lacksC2paData(segment);
              const validationKind = resolveValidationBadge(segment);
              const isContinuityOk = !segment.errorCodes?.includes(
                ValidationErrorCode.CONTINUITY_INVALID,
              );

              return (
                <Row
                  key={`${segment.segmentNumber}-${segment.mediaType}-${segment.timestamp}`}
                  $selected={selectedSegment === segment}
                  $category={category}
                  onClick={() => onSegmentSelect(segment)}
                >
                  <Td>{segment.segmentNumber}</Td>
                  <Td>{segment.mediaType}</Td>
                  <Td>{segment.segmentNumber}</Td>
                  {isManifestBox ? (
                    <Td title={segment.previousManifestId ?? undefined}>
                      {hasNoC2paData || segment.previousManifestId == null ? (
                        '—'
                      ) : (
                        <ContinuityBadge $ok={isContinuityOk}>
                          {isContinuityOk ? '✓' : '✗'} {truncate(segment.previousManifestId, 10)}
                        </ContinuityBadge>
                      )}
                    </Td>
                  ) : (
                    <Td title={segment.keyId ?? undefined}>
                      {hasNoC2paData ? '—' : truncate(segment.keyId)}
                    </Td>
                  )}
                  <Td title={segment.hash ?? undefined}>
                    {hasNoC2paData || !segment.hash ? '—' : truncate(segment.hash)}
                  </Td>
                  <Td>
                    <ValidBadge $status={validationKind}>
                      {VALIDATION_BADGE_LABEL[validationKind]}
                    </ValidBadge>
                  </Td>
                  <Td>
                    <StatusBadge $category={category}>
                      <span>{statusIcon(segment.status)}</span>
                      <span>{statusText(segment.status)}</span>
                    </StatusBadge>
                  </Td>
                </Row>
              );
            })}
          </tbody>
        </Table>

        {segments.length === 0 && <EmptyState>No segments validated yet</EmptyState>}
      </TableWrapper>
    </Container>
  );
};

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: #e5e5e5;
  margin: 0;
`;

const Stats = styled.div`
  display: flex;
  gap: 1rem;
`;

const Stat = styled.span<{ $color: string }>`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${(p) => p.$color};
`;

const TableWrapper = styled.div`
  background: #1e1e1e;
  border: 1px solid #4a4a4a;
  border-radius: 8px;
  overflow: hidden;
  max-height: ${TABLE_MAX_HEIGHT};
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-thumb {
    background: #555;
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: #666;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  table-layout: fixed;

  th:nth-child(1),
  td:nth-child(1) {
    width: 8%;
  }
  th:nth-child(2),
  td:nth-child(2) {
    width: 10%;
  }
  th:nth-child(3),
  td:nth-child(3) {
    width: 8%;
  }
  th:nth-child(4),
  td:nth-child(4) {
    width: 18%;
  }
  th:nth-child(5),
  td:nth-child(5) {
    width: 14%;
  }
  th:nth-child(6),
  td:nth-child(6) {
    width: 16%;
  }
  th:nth-child(7),
  td:nth-child(7) {
    width: 26%;
  }
`;

const Th = styled.th`
  background: #2d2d2d;
  color: #a0a0a0;
  padding: 0.75rem 0.5rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid #4a4a4a;
`;

const InitRow = styled.tr`
  background: #2d2d2d;
  box-shadow: inset 3px 0 0 #4ade80;
  position: sticky;
  top: ${HEADER_ROW_HEIGHT};
  z-index: 5;
  border-bottom: 2px solid #4ade80;

  &:hover {
    background: #353535;
  }
`;

const Row = styled.tr<{
  $selected: boolean;
  $category: 'valid' | 'failed' | 'warning' | 'unverified';
}>`
  cursor: pointer;
  background: ${(p) => (p.$selected ? '#2a2a2a' : 'transparent')};
  box-shadow: ${(p) => {
    if (!p.$selected) return 'none';
    const color =
      p.$category === 'valid'
        ? '#4ade80'
        : p.$category === 'failed'
          ? '#ef4444'
          : p.$category === 'warning'
            ? '#fbbf24'
            : '#60a5fa';
    return `inset 3px 0 0 ${color}`;
  }};
  transition: background 0.15s ease;

  &:hover {
    background: #252525;
  }
  &:not(:last-child) {
    border-bottom: 1px solid #333;
  }
`;

const Td = styled.td`
  padding: 0.75rem 0.5rem;
  color: #e5e5e5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
`;

const VALIDATION_BADGE_BACKGROUND: Record<ValidationBadgeKindValue, string> = {
  [ValidationBadgeKind.VALID]: '#22c55e',
  [ValidationBadgeKind.FAILED]: '#ef4444',
  [ValidationBadgeKind.WARNING]: '#eab308',
  [ValidationBadgeKind.PENDING]: 'rgba(251, 191, 36, 0.2)',
  [ValidationBadgeKind.EMPTY]: 'transparent',
};

const MUTED_BADGE_KINDS: ReadonlySet<ValidationBadgeKindValue> = new Set([
  ValidationBadgeKind.EMPTY,
  ValidationBadgeKind.PENDING,
]);

const ValidBadge = styled.span<{ $status: ValidationBadgeKindValue }>`
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: ${(p) => (MUTED_BADGE_KINDS.has(p.$status) ? '#888' : '#fff')};
  background: ${(p) => VALIDATION_BADGE_BACKGROUND[p.$status]};
`;

const StatusBadge = styled.div<{ $category: 'valid' | 'failed' | 'warning' | 'unverified' }>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  background: ${(p) => {
    switch (p.$category) {
      case 'valid':
        return 'rgba(74, 222, 128, 0.1)';
      case 'failed':
        return 'rgba(239, 68, 68, 0.1)';
      case 'warning':
        return 'rgba(251, 191, 36, 0.1)';
      case 'unverified':
        return 'rgba(96, 165, 250, 0.1)';
    }
  }};
  border: 1px solid
    ${(p) =>
      p.$category === 'valid'
        ? 'rgba(74, 222, 128, 0.3)'
        : p.$category === 'failed'
          ? 'rgba(239, 68, 68, 0.3)'
          : p.$category === 'warning'
            ? 'rgba(251, 191, 36, 0.3)'
            : 'rgba(96, 165, 250, 0.3)'};
`;

const ContinuityBadge = styled.span<{ $ok: boolean }>`
  font-size: 0.75rem;
  font-weight: 600;
  color: ${(p) => (p.$ok ? '#4ade80' : '#ef4444')};
`;

const EmptyState = styled.div`
  padding: 3rem 1rem;
  text-align: center;
  color: #888;
  font-size: 0.875rem;
`;
