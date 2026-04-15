import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import styled from 'styled-components';
import { DemoModeSwitcher } from './components/DemoModeSwitcher.js';
import { QUALABS_LOGO_URL, C2PA_LOGO_URL, GOOGLE_LOGO_BASE64 } from './constants.js';

const DashjsNativeDemo = lazy(() => import('./views/DashjsNativeDemo.js'));
const VideoJsEnhancedDemo = lazy(() => import('./views/VideoJsEnhancedDemo.js'));

const DEMO_TITLE = 'C2PA live streaming end-2-end reference workflow';

const App: React.FC = () => (
  <BrowserRouter>
    <Layout>
      <PageHeader>
        <LogoContainer>
          <Logo src={QUALABS_LOGO_URL} alt="Qualabs Logo" style={{ height: '40px' }} />
          <Logo src={GOOGLE_LOGO_BASE64} alt="Google Logo" style={{ height: '32px' }} />
          <Logo
            src={C2PA_LOGO_URL}
            alt="C2PA Logo"
            style={{ height: '36px', filter: 'brightness(0) invert(1)' }}
          />
        </LogoContainer>
        <HeaderTitle>{DEMO_TITLE}</HeaderTitle>
      </PageHeader>

      <DemoModeSwitcher />

      <Content>
        <Suspense fallback={<Loading>Loading…</Loading>}>
          <Routes>
            <Route path="/" element={<Navigate to="/videojs-enhanced" replace />} />
            <Route path="/dashjs-native" element={<DashjsNativeDemo />} />
            <Route path="/videojs-enhanced" element={<VideoJsEnhancedDemo />} />
          </Routes>
        </Suspense>
      </Content>
    </Layout>
  </BrowserRouter>
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
