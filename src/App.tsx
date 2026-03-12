import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import LandingPage from './pages/home/landing';
import ProjectManagePage from './pages/project/manage';
import LoginPage from './pages/home/login';
import CapabilityManagePage from './pages/capability/manage';
import GridBuilderDemo from './pages/demo/GridBuilderDemo';
import TeamsManagePage from './pages/teams/manage';
import TasksOverviewPage from './pages/tasks/manage';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route element={<AppLayout />}>
          <Route path="/project" element={<ProjectManagePage />} />
          <Route path="/teams" element={<TeamsManagePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/capability" element={<CapabilityManagePage />} />
          <Route path="/grid-demo" element={<GridBuilderDemo />} />
          <Route path="/tasks" element={<TasksOverviewPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
