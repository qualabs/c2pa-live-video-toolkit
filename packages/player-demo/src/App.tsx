import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import styled from 'styled-components';
import { DemoModeSwitcher } from './components/DemoModeSwitcher.js';

const DashjsNativeDemo = lazy(() => import('./views/DashjsNativeDemo.js'));
const VideoJsEnhancedDemo = lazy(() => import('./views/VideoJsEnhancedDemo.js'));

const QUALABS_LOGO_URL = 'https://www.qualabs.com/packages/website/images/logos/qualabs-light.svg';
const C2PA_LOGO_URL = 'https://c2pa.org/wp-content/uploads/sites/33/2025/05/logo.svg';
const GOOGLE_LOGO_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAA7VBMVEVHcEz/RkL/R0D+SEr/RUD/RkOwjlb/SD7/SE3/SUj/Vzb/VDf9TFb8TVeHoFb/YTD/byn8TVn/jRr/fSL/mxL/SEj+yQn/ohH/tQv+VUb/vQn/wwn+zgj9wQm3xQ39zgT6zQYwhv/7zgowhv8uhv0ek+Avhv7yzAPjywIvhv0whv7PyQHUygIth/y3yAEnivSlxwGSxgUak94fj+h5xAlgwxMLqp8NnsQVlte6xwBNwh45wC0xwDMLt28IrJgJpa0kjPCaxQEpvzsevkkWvVANumQQu18JtXkIsIgTvVYOvGALuWtJwh4OvF8OvF9ccfxCAAAAT3RSTlMAUZvT7P8T//+wiv//kAv6/mD//+V2jv//JKf//0EmxOr/rP7+MEX//x10/6eu//3+/9v///7I//+K//+KS/3/YeX//7dsnv7/////5s3tMAqBMAAAAXFJREFUeAF0jUUCwCAMwDp3d/f9/4krnVt6goQCFzheECVJFHgOPpB5RZHYIKqqyU+vGwpCXkVM07pp2zEQ8hSYiCBf1rsuFrQCvaSahHe+9wMqWHJuOD2E/lYoWsRxkUbBxcdJshY6bEQ3L6fpWmTnXXbxkBcpJTb8UBZFgUX156uyLLHI4Y+YgqL+DZqS0R7n7o4NLQX9GQwbI5tugpKI7wF5Rjd/BiNCCQZfX5BfCwyWrsnagGEYiKKpMkLqgJmZmXn/caKTzGoM7+v4IEiWPQdJ4fMhFujHCzjH7Wny6xFwMB9UKBa4KN3Tl4kh9AZYVJRbpXhVVRGX0asEXNP1a7MM0wQJA+0WFcQtyz7bcFzPAwn+8AkPwmjDcZK6WJGR75zwsCirOo7rpu0SojC2oQUeIF72/TCMY4sUKSj2wX9iXgAHwYgEoKBPizOBgx4EhwnCtxOtDnYTzn1Gnw3wzYQT3zDJrpmXYVjmpj7d/gPknlJE6eZSewAAAABJRU5ErkJggg==';
const TITLE = 'C2PA live streaming end-2-end reference workflow';

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
        <HeaderTitle>{TITLE}</HeaderTitle>
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
  transition: transform 0.2s ease, filter 0.2s ease;

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
