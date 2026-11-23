import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './pages/Login';

// Temporary Home view that confirms authentication works
const HomePlaceholder: React.FC = () => {
  const { user } = useAuth();

  if (user?.role === 'system_admin') {
    return (
      <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm text-center">
        <h2 className="text-xl font-bold text-slate-800">System Administrator Portal</h2>
        <p className="mt-2 text-slate-600">
          You are logged in as Platform System Administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Welcome back, {user?.name}!
          </h1>
          <p className="text-slate-500 mt-1">
            Organization: <span className="font-medium text-slate-700">{user?.organization?.name}</span> • Role: <span className="font-medium text-slate-700 capitalize">{user?.role}</span>
          </p>
        </div>
        <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-semibold">
          Phase 10: Auth & Routing Active
        </span>
      </div>

      <div className="mt-6 text-slate-600 text-sm">
        Frontend setup, JWT authentication, protected routes, and Tailwind styling are fully active!
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePlaceholder />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;