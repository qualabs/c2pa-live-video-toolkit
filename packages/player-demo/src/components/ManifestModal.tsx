import React from 'react';
import styled from 'styled-components';
import { ERROR_CODE_MESSAGES } from '@qualabs/c2pa-live-dashjs-plugin';
import type { InitProcessedEvent } from '@qualabs/c2pa-live-dashjs-plugin';
import { convertBuffersToHex } from '../utils/bufferUtils.js';

interface ManifestModalProps {
  isOpen: boolean;
  manifest: unknown;
  initData: InitProcessedEvent | null;
  onClose: () => void;
}

const SESSION_KEYS_LABEL = '"label": "c2pa.session-keys"';

/**
 * Renders the manifest JSON with the c2pa.session-keys assertion highlighted in green.
 * Uses a stateful line scan to track when we enter and exit the assertion block.
 */
function renderManifestWithHighlight(manifest: unknown): React.ReactNode[] {
  const withHex = convertBuffersToHex(manifest) as Record<string, unknown>;
  const assertionsArray =
    (withHex.assertions as { data?: unknown[] } | undefined)?.data ??
    (withHex.assertions as unknown[]) ??
    [];
  const json = JSON.stringify({ ...withHex, assertions: assertionsArray }, null, 2);
  const lines = json.split('\n');

  let inSessionKeys = false;
  let braceCount = 0;
  let startLine = -1;

  return lines.map((line, index) => {
    if (line.includes(SESSION_KEYS_LABEL)) {
      inSessionKeys = true;
      startLine = index;
      braceCount = 0;
    }

    if (inSessionKeys) {
      for (const char of line) {
        if (char === '{' || char === '[') braceCount++;
        if (char === '}' || char === ']') braceCount--;
      }
      const isLast = braceCount <= 0 && index > startLine;
      const node = (
        <span key={index} style={{ color: '#4ade80' }}>
          {line}
          {'\n'}
        </span>
      );
      if (isLast) inSessionKeys = false;
      return node;
    }

    return (
      <span key={index}>
        {line}
        {'\n'}
      </span>
    );
  });
}

export const ManifestModal: React.FC<ManifestModalProps> = ({
  isOpen,
  manifest: manifestProp,
  initData,
  onClose,
}) => {
  if (!isOpen) return null;

  // Prefer manifest from initData (VSI method), fall back to prop (ManifestBox method)
  const manifest = initData?.manifest ?? manifestProp;
  const isValid = initData?.success && (initData.errorCodes?.length ?? 0) === 0;
  const errorCodes = (initData?.errorCodes ?? []) as string[];

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>C2PA Manifest — Init Segment</ModalTitle>
          <CloseButton onClick={onClose}>✕</CloseButton>
        </ModalHeader>

        {initData && (
          <>
            <ValidationStatus $isValid={isValid ?? false}>
              <StatusIcon>{isValid ? '✓' : '✗'}</StatusIcon>
              <StatusText>{isValid ? 'Manifest Valid' : 'Manifest Invalid'}</StatusText>
              <StatusDetails>
                <DetailItem>Session Keys: {initData.sessionKeysCount}</DetailItem>
                <DetailItem>Manifest ID: {initData.manifestId ? 'Present' : 'Missing'}</DetailItem>
              </StatusDetails>
            </ValidationStatus>

            {errorCodes.length > 0 && (
              <ErrorsBar>
                <ErrorsTitle>Validation Errors ({errorCodes.length})</ErrorsTitle>
                {errorCodes.map((code, i) => (
                  <ErrorItem key={i}>
                    <ErrorCode>{code}</ErrorCode>
                    <span>
                      {' '}
                      — {(ERROR_CODE_MESSAGES as Record<string, string | undefined>)[code] ?? code}
                    </span>
                  </ErrorItem>
                ))}
              </ErrorsBar>
            )}
          </>
        )}

        <ModalBody>
          <JsonViewer>
            {manifest ? (
              <pre>{renderManifestWithHighlight(manifest)}</pre>
            ) : initData ? (
              <EmptyJson>
                VSI method: the init segment carries session keys only — no C2PA manifest JSON is
                embedded.
                {initData.manifestId && (
                  <>
                    <br />
                    <br />
                    Manifest ID: <code>{initData.manifestId}</code>
                  </>
                )}
              </EmptyJson>
            ) : (
              <EmptyJson>
                No manifest data available. Load a stream to validate the init segment.
              </EmptyJson>
            )}
          </JsonViewer>
        </ModalBody>
      </ModalContent>
    </ModalOverlay>
  );
};

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 2rem;
`;
const ModalContent = styled.div`
  background: #1e1e1e;
  border-radius: 12px;
  width: 100%;
  max-width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
`;
const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid #2d2d2d;
`;
const ModalTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: #e5e5e5;
  margin: 0;
`;
const CloseButton = styled.button`
  background: none;
  border: none;
  color: #999;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  transition: color 0.2s ease;
  &:hover {
    color: #e5e5e5;
  }
`;
const ValidationStatus = styled.div<{ $isValid: boolean }>`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: ${(p) => (p.$isValid ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)')};
  border-bottom: 1px solid ${(p) => (p.$isValid ? 'rgba(74,222,128,0.2)' : 'rgba(239,68,68,0.2)')};
`;
const StatusIcon = styled.span`
  font-size: 1.5rem;
`;
const StatusText = styled.span`
  font-size: 1rem;
  font-weight: 600;
  color: #e5e5e5;
`;
const StatusDetails = styled.div`
  display: flex;
  gap: 1.5rem;
  margin-left: auto;
`;
const DetailItem = styled.span`
  font-size: 0.875rem;
  color: #999;
`;
const ErrorsBar = styled.div`
  padding: 0.75rem 1.5rem;
  background: rgba(239, 68, 68, 0.08);
  border-bottom: 1px solid rgba(239, 68, 68, 0.2);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`;
const ErrorsTitle = styled.span`
  font-size: 0.85rem;
  font-weight: 600;
  color: #f87171;
`;
const ErrorItem = styled.div`
  font-size: 0.8rem;
  color: #999;
  padding-left: 1rem;
`;
const ErrorCode = styled.span`
  color: #f87171;
  font-family: monospace;
`;
const ModalBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
`;
const JsonViewer = styled.div`
  background: #0d0d0d;
  border-radius: 8px;
  padding: 1.5rem;
  pre {
    margin: 0;
    font-family: 'Fira Code', 'Courier New', monospace;
    font-size: 0.875rem;
    line-height: 1.6;
    color: #e5e5e5;
    white-space: pre-wrap;
    word-break: break-word;
  }
`;
const EmptyJson = styled.div`
  color: #666;
  font-style: italic;
  text-align: center;
  padding: 2rem;
`;
