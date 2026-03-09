import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import ProjectManagePage from './pages/project/manage';
import LoginPage from './pages/home/login';
import CapabilityManagePage from './pages/cability/manage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<ProjectManagePage />} />
          <Route path="/project" element={<ProjectManagePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cability" element={<CapabilityManagePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
