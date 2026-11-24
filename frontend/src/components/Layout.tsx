import {
  Building2,
  CheckSquare,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Shield,
  Users,
} from 'lucide-react';
import React, { useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ChangePasswordModal } from './ChangePasswordModal';

export const Layout: React.FC = () => {
  const { user, isLoading, logout } = useAuth();
  const location = useLocation();

  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-slate-500 font-medium animate-pulse">Loading application...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Mandatory first-time password change check
  const requiresFirstTimePasswordChange = Boolean(user.mustChangePassword);

  const roleBadgeColors = {
    system_admin: 'bg-purple-100 text-purple-700 border-purple-200',
    manager: 'bg-blue-100 text-blue-700 border-blue-200',
    developer: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };

  const roleTitles = {
    system_admin: 'System Admin',
    manager: 'Manager',
    developer: 'Developer',
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link to="/" className="flex items-center space-x-2.5">
                <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-sm">
                  SR
                </div>
                <span className="font-bold text-slate-800 text-lg tracking-tight">
                  ServiceDesk
                </span>
              </Link>

              {/* Navigation Links based on Role (hidden if mandatory password change) */}
              {!requiresFirstTimePasswordChange && (
                <nav className="hidden md:flex space-x-1">
                  {user.role !== 'system_admin' && (
                    <>
                      <Link
                        to="/"
                        className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          location.pathname === '/'
                            ? 'bg-slate-100 text-slate-900 font-semibold'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                      >
                        <LayoutDashboard className="w-4 h-4 mr-1.5" />
                        Dashboard
                      </Link>
                      <Link
                        to="/requests"
                        className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          location.pathname.startsWith('/requests')
                            ? 'bg-slate-100 text-slate-900 font-semibold'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                      >
                        <CheckSquare className="w-4 h-4 mr-1.5" />
                        Requests
                      </Link>
                    </>
                  )}

                  {user.role === 'manager' && (
                    <Link
                      to="/members"
                      className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        location.pathname.startsWith('/members')
                          ? 'bg-slate-100 text-slate-900 font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <Users className="w-4 h-4 mr-1.5" />
                      Developers
                    </Link>
                  )}

                  {user.role === 'system_admin' && (
                    <Link
                      to="/admin/organizations"
                      className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        location.pathname.startsWith('/admin')
                          ? 'bg-slate-100 text-slate-900 font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <Building2 className="w-4 h-4 mr-1.5" />
                      Organizations
                    </Link>
                  )}
                </nav>
              )}
            </div>

            {/* User Profile and Action Buttons */}
            <div className="flex items-center space-x-3">
              <div className="hidden sm:flex flex-col items-end">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-semibold text-slate-800">{user.name}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                      roleBadgeColors[user.role]
                    }`}
                  >
                    {roleTitles[user.role]}
                  </span>
                </div>
                {user.organization && (
                  <span className="text-xs text-slate-500 font-medium">
                    {user.organization.name}
                  </span>
                )}
                {user.role === 'system_admin' && (
                  <span className="text-xs text-slate-400 flex items-center">
                    <Shield className="w-3 h-3 mr-0.5" /> Platform Admin
                  </span>
                )}
              </div>

              {/* Change Password Button */}
              <button
                onClick={() => setIsChangePasswordOpen(true)}
                title="Change Password"
                className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-slate-200"
              >
                <KeyRound className="w-4 h-4" />
              </button>

              {/* Logout Button */}
              <button
                onClick={logout}
                title="Sign out"
                className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-slate-200"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {requiresFirstTimePasswordChange ? (
          <div className="text-center py-16 text-slate-500">
            Please update your password to proceed to your dashboard.
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {/* Change Password Modal (Mandatory or Normal) */}
      <ChangePasswordModal
        isOpen={requiresFirstTimePasswordChange || isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        isMandatory={requiresFirstTimePasswordChange}
      />
    </div>
  );
};