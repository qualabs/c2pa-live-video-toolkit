import React from 'react';
import { NavLink } from 'react-router-dom';
import styled from 'styled-components';

/**
 * Navigation bar for switching between the two demo modes.
 * Uses React Router NavLink so the active mode is highlighted.
 */
export const DemoModeSwitcher: React.FC = () => (
  <Nav>
    <ModeLink to="/videojs-enhanced">
      <ModeIcon>🎬</ModeIcon>
      <ModeInfo>
        <ModeName>video.js Enhanced</ModeName>
        <ModeDesc>Full C2PA UI overlays via videojs-ui</ModeDesc>
      </ModeInfo>
    </ModeLink>
    <Divider />
    <ModeLink to="/dashjs-native" end>
      <ModeIcon>⚡</ModeIcon>
      <ModeInfo>
        <ModeName>dash.js Native</ModeName>
        <ModeDesc>attachC2pa() only — no video.js</ModeDesc>
      </ModeInfo>
    </ModeLink>
  </Nav>
);

const Nav = styled.nav`
  display: flex;
  align-items: stretch;
  gap: 0;
  background: #1e1e1e;
  border: 1px solid #4a4a4a;
  border-radius: 8px;
  overflow: hidden;
  width: 100%;
`;

const ModeLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  padding: 0.875rem 1.25rem;
  text-decoration: none;
  color: #a0a0a0;
  transition: all 0.2s ease;

  &:hover {
    background: #252525;
    color: #e5e5e5;
  }

  &.active {
    background: #252525;
    color: #e5e5e5;
    border-bottom: 2px solid #4ade80;
  }
`;

const ModeIcon = styled.span`
  font-size: 1.25rem;
`;

const ModeInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
`;

const ModeName = styled.span`
  font-size: 0.875rem;
  font-weight: 600;
`;

const ModeDesc = styled.span`
  font-size: 0.7rem;
  opacity: 0.7;
`;

const Divider = styled.div`
  width: 1px;
  background: #4a4a4a;
  flex-shrink: 0;
`;
