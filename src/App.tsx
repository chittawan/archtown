import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import LandingPage from './pages/home/landing';
import ProjectManagePage from './pages/project/manage';
import LoginPage from './pages/home/login';
import CapabilityManagePage from './pages/cability/manage';
import TeamsManagePage from './pages/teams/manage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route element={<AppLayout />}>
          <Route path="/project" element={<ProjectManagePage />} />
          <Route path="/teams" element={<TeamsManagePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cability" element={<CapabilityManagePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
