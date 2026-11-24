import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { RequestDetail } from './pages/RequestDetail';
import { RequestList } from './pages/RequestList';

const HomeRedirect: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === 'system_admin') {
    return <Navigate to="/admin/organizations" replace />;
  }
  return <Navigate to="/requests" replace />;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<HomeRedirect />} />
            <Route path="requests" element={<RequestList />} />
            <Route path="requests/:id" element={<RequestDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;