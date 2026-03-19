import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

export default function App() {
  return (
    <BrowserRouter>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
