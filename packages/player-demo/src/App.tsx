import React, { Suspense, lazy } from 'react';
import styled from 'styled-components';
import { QUALABS_LOGO_URL, C2PA_LOGO_URL } from './constants.js';
import unifiedStreamingLogo from './assets/unified-streaming-logo.png';
import wdrLogo from './assets/wdr-logo.png';

const VideoJsEnhancedDemo = lazy(() => import('./views/VideoJsEnhancedDemo.js'));

const DEMO_TITLE = 'C2PA live streaming end-2-end reference workflow';

const App: React.FC = () => (
  <Layout>
    <PageHeader>
      <LogoContainer>
        <Logo src={QUALABS_LOGO_URL} alt="Qualabs Logo" style={{ height: '28px' }} />
        <Logo src={unifiedStreamingLogo} alt="Unified Streaming Logo" style={{ height: '64px' }} />
        <Logo src={wdrLogo} alt="WDR Logo" style={{ height: '28px' }} />
        <Logo
          src={C2PA_LOGO_URL}
          alt="C2PA Logo"
          style={{ height: '36px', filter: 'brightness(0) invert(1)' }}
        />
      </LogoContainer>
      <HeaderTitle>{DEMO_TITLE}</HeaderTitle>
    </PageHeader>

    <Content>
      <Suspense fallback={<Loading>Loading…</Loading>}>
        <VideoJsEnhancedDemo />
      </Suspense>
    </Content>
  </Layout>
);

export default App;

const Layout = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.25rem;
  max-width: 1600px;
  margin: 0 auto;
  min-height: 100vh;
`;

const PageHeader = styled.header`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 1.5rem 1rem;
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border-bottom: 2px solid #4a4a4a;
  border-radius: 8px;
  width: 100%;
  box-sizing: border-box;
`;

const LogoContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  flex-wrap: wrap;
`;

const Logo = styled.img`
  object-fit: contain;
  filter: brightness(1.1);
  transition:
    transform 0.2s ease,
    filter 0.2s ease;

  &:hover {
    transform: scale(1.05);
    filter: brightness(1.2);
  }
`;

const HeaderTitle = styled.h1`
  font-size: 1.5rem;
  font-weight: 600;
  color: #e5e5e5;
  margin: 0;
  text-align: center;
  letter-spacing: 0.5px;
`;

const Content = styled.main`
  flex: 1;
`;

const Loading = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4rem;
  color: #888;
  font-size: 1rem;
`;
