import {
  AlertCircle,
  Building2,
  Calendar,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';

type Organization = {
  id: number;
  name: string;
  createdAt: string;
  managerCount: number;
  developerCount: number;
};

type ManagerUser = {
  id: number;
  name: string;
  email: string;
  role: 'manager';
  isActive: boolean;
  createdAt: string;
};

export const AdminOrganizations: React.FC = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Organization Modal
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [orgModalError, setOrgModalError] = useState<string | null>(null);
  const [isSubmittingOrg, setIsSubmittingOrg] = useState(false);

  // View / Add Managers Drawer/Modal
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [managers, setManagers] = useState<ManagerUser[]>([]);
  const [isLoadingManagers, setIsLoadingManagers] = useState(false);
  const [isAddManagerOpen, setIsAddManagerOpen] = useState(false);
  const [newMgrName, setNewMgrName] = useState('');
  const [newMgrEmail, setNewMgrEmail] = useState('');
  const [newMgrPassword, setNewMgrPassword] = useState('');
  const [mgrModalError, setMgrModalError] = useState<string | null>(null);
  const [isSubmittingMgr, setIsSubmittingMgr] = useState(false);

  const fetchOrganizations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ organizations: Organization[] }>('/api/organizations');
      setOrganizations(res.organizations);
    } catch (err: any) {
      setError(err.message || 'Failed to load organizations.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const openManagersModal = async (org: Organization) => {
    setSelectedOrg(org);
    setIsLoadingManagers(true);
    try {
      const res = await apiRequest<{ managers: ManagerUser[] }>(`/api/organizations/${org.id}/managers`);
      setManagers(res.managers);
    } catch (err: any) {
      alert(err.message || 'Failed to load organization managers.');
    } finally {
      setIsLoadingManagers(false);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgModalError(null);
    setIsSubmittingOrg(true);
    try {
      await apiRequest('/api/organizations', {
        method: 'POST',
        body: { name: newOrgName.trim() },
      });
      setIsOrgModalOpen(false);
      setNewOrgName('');
      fetchOrganizations();
    } catch (err: any) {
      setOrgModalError(err.message || 'Failed to create organization.');
    } finally {
      setIsSubmittingOrg(false);
    }
  };

  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    setMgrModalError(null);
    setIsSubmittingMgr(true);
    try {
      await apiRequest(`/api/organizations/${selectedOrg.id}/managers`, {
        method: 'POST',
        body: {
          name: newMgrName.trim(),
          email: newMgrEmail.trim().toLowerCase(),
          password: newMgrPassword,
        },
      });
      setIsAddManagerOpen(false);
      setNewMgrName('');
      setNewMgrEmail('');
      setNewMgrPassword('');
      openManagersModal(selectedOrg);
      fetchOrganizations();
    } catch (err: any) {
      setMgrModalError(err.message || 'Failed to create manager.');
    } finally {
      setIsSubmittingMgr(false);
    }
  };

  const handleToggleManagerStatus = async (mgr: ManagerUser) => {
    if (!selectedOrg) return;
    const nextState = !mgr.isActive;
    const confirmMessage = nextState
      ? `Reactivate manager ${mgr.name}?`
      : `Deactivate manager ${mgr.name}? They will be logged out immediately.`;

    if (!window.confirm(confirmMessage)) return;

    try {
      await apiRequest(`/api/organizations/${selectedOrg.id}/managers/${mgr.id}/status`, {
        method: 'PATCH',
        body: { isActive: nextState },
      });
      openManagersModal(selectedOrg);
    } catch (err: any) {
      alert(err.message || 'Failed to update manager status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Client Organizations</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
              Platform Admin
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage multi-tenant client companies and designate organization managers.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchOrganizations}
            title="Refresh list"
            className="p-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsOrgModalOpen(true)}
            className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Organization
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm flex items-center">
          <AlertCircle className="w-5 h-5 mr-2 text-rose-500 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Organizations Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-semibold">
              <tr>
                <th className="px-6 py-3.5">Organization</th>
                <th className="px-6 py-3.5">Created Date</th>
                <th className="px-6 py-3.5">Managers</th>
                <th className="px-6 py-3.5">Developers</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center space-x-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                      <span>Loading organizations...</span>
                    </div>
                  </td>
                </tr>
              ) : organizations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    No organizations found.
                  </td>
                </tr>
              ) : (
                organizations.map((org) => (
                  <tr key={org.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-900 whitespace-nowrap">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 font-bold text-xs">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <span>{org.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">
                      <span className="flex items-center">
                        <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
                        {new Date(org.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        {org.managerCount} {org.managerCount === 1 ? 'Manager' : 'Managers'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {org.developerCount} {org.developerCount === 1 ? 'Developer' : 'Developers'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => openManagersModal(org)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
                      >
                        Manage Managers
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Organization Modal */}
      {isOrgModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Create Client Organization</h3>
              <button
                onClick={() => setIsOrgModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {orgModalError && (
              <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-start">
                <AlertCircle className="w-5 h-5 mr-2 text-rose-500 flex-shrink-0 mt-0.5" />
                <span>{orgModalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateOrg} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Organization Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="e.g. Acme Corporation"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOrgModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOrg || !newOrgName.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50"
                >
                  {isSubmittingOrg ? 'Creating...' : 'Create Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Managers Modal */}
      {selectedOrg && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {selectedOrg.name} — Managers
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Designate leaders who can manage requests and developers for this organization.
                </p>
              </div>
              <button
                onClick={() => setSelectedOrg(null)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                  Assigned Managers ({managers.length})
                </h4>
                <button
                  onClick={() => setIsAddManagerOpen(!isAddManagerOpen)}
                  className="inline-flex items-center text-xs font-semibold px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg transition"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  {isAddManagerOpen ? 'Cancel' : 'Add Manager'}
                </button>
              </div>

              {/* Add Manager Inline Form */}
              {isAddManagerOpen && (
                <form
                  onSubmit={handleCreateManager}
                  className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
                >
                  <div className="font-semibold text-slate-800 text-xs uppercase tracking-wider">
                    Add New Manager
                  </div>

                  {mgrModalError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-md text-rose-700 text-xs">
                      {mgrModalError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      required
                      placeholder="Full Name"
                      value={newMgrName}
                      onChange={(e) => setNewMgrName(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                    <input
                      type="email"
                      required
                      placeholder="Email"
                      value={newMgrEmail}
                      onChange={(e) => setNewMgrEmail(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                    <input
                      type="password"
                      required
                      minLength={8}
                      placeholder="Password"
                      value={newMgrPassword}
                      onChange={(e) => setNewMgrPassword(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={isSubmittingMgr}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-medium disabled:opacity-50"
                    >
                      {isSubmittingMgr ? 'Creating...' : 'Save Manager'}
                    </button>
                  </div>
                </form>
              )}

              {/* Managers List */}
              {isLoadingManagers ? (
                <div className="text-center py-6 text-slate-400 text-sm">Loading managers...</div>
              ) : managers.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm">
                  No managers appointed yet for this organization.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                  {managers.map((m) => (
                    <div key={m.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50">
                      <div>
                        <div className="font-semibold text-slate-900 text-sm">{m.name}</div>
                        <div className="text-xs text-slate-400 font-mono">{m.email}</div>
                      </div>

                      <div className="flex items-center space-x-3">
                        {m.isActive ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                            Deactivated
                          </span>
                        )}

                        <button
                          onClick={() => handleToggleManagerStatus(m)}
                          className={`text-xs font-medium px-2.5 py-1 rounded-md border transition ${
                            m.isActive
                              ? 'text-rose-600 border-rose-200 hover:bg-rose-50'
                              : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                          }`}
                        >
                          {m.isActive ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedOrg(null)}
                className="px-4 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-white transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};