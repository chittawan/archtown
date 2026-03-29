import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { OAUTH_FRAGMENT_CONSUMED_KEY } from './lib/googleAuth';
import AppLayout from './components/layout/AppLayout';
import LandingPage from './pages/home/landing';
import AuthCallbackPage from './pages/auth/callback';
import ProjectManagePage from './pages/project/manage';
import LoginPage from './pages/home/login';
import GenerateTokenPage from './pages/admin/generate-token';
import CapabilityManagePage from './pages/capability/manage';
import GridBuilderDemo from './pages/demo/GridBuilderDemo';
import TeamsManagePage from './pages/teams/manage';
import TasksOverviewPage from './pages/tasks/manage';
import AIContextPage from './pages/ai/context';
import EaWeeklyOverviewPage from './pages/ea/weeklyOverview';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

function ClearOAuthCallbackFragmentFlag() {
  const location = useLocation();
  useEffect(() => {
    if (location.pathname !== '/auth/callback') {
      try {
        sessionStorage.removeItem(OAUTH_FRAGMENT_CONSUMED_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [location.pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ClearOAuthCallbackFragmentFlag />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route element={<AppLayout />}>
          <Route path="/project" element={<ProjectManagePage />} />
          <Route path="/teams" element={<TeamsManagePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin/generate-token" element={<GenerateTokenPage />} />
          <Route path="/capability" element={<CapabilityManagePage />} />
          <Route path="/grid-demo" element={<GridBuilderDemo />} />
          <Route path="/tasks" element={<TasksOverviewPage />} />
          <Route path="/ai/context" element={<AIContextPage />} />
          <Route path="/ea/weekly" element={<EaWeeklyOverviewPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
