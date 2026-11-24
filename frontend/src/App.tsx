import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminOrganizations } from './pages/AdminOrganizations';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Members } from './pages/Members';
import { RequestDetail } from './pages/RequestDetail';
import { RequestList } from './pages/RequestList';

// Root index route: System Admin goes to /admin/organizations, Managers & Developers go to /dashboard
const HomeIndex: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === 'system_admin') {
    return <Navigate to="/admin/organizations" replace />;
  }
  return <Dashboard />;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<HomeIndex />} />
            <Route path="requests" element={<RequestList />} />
            <Route path="requests/:id" element={<RequestDetail />} />
            <Route path="members" element={<Members />} />
            <Route path="admin/organizations" element={<AdminOrganizations />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;