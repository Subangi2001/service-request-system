import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Edit,
  History,
  Play,
  RotateCcw,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { OverdueBadge, PriorityBadge, StatusBadge } from '../components/Badges';
import { RequestModal } from '../components/RequestModal';
import { useAuth } from '../context/AuthContext';
import type { AuditLogEntry, DeveloperOption, ServiceRequest } from '../types/request';

export const RequestDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [developers, setDevelopers] = useState<DeveloperOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modal and Dialog States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);

  // Form states for assignment/reassignment/reopen
  const [selectedDevId, setSelectedDevId] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchRequest = async () => {
    try {
      const res = await apiRequest<{ request: ServiceRequest }>(`/api/requests/${id}`);
      setRequest(res.request);

      // If user is manager, also load audit trail and active developers
      if (user?.role === 'manager') {
        const [auditRes, devRes] = await Promise.all([
          apiRequest<{ auditLogs: AuditLogEntry[] }>(`/api/requests/${id}/audit`),
          apiRequest<{ users: any[] }>('/api/users?role=developer'),
        ]);
        setAuditLogs(auditRes.auditLogs);
        setDevelopers(
          devRes.users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            isActive: u.isActive,
          }))
        );
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load request.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequest();
  }, [id]);

  // Transition handler
  const handleTransition = async (newStatus: string, transitionReason?: string) => {
    if (!request) return;
    setActionError(null);
    setIsSubmitting(true);

    try {
      const res = await apiRequest<{ request: ServiceRequest }>(`/api/requests/${request.id}/status`, {
        method: 'POST',
        body: {
          status: newStatus,
          version: request.version,
          reason: transitionReason,
        },
      });
      setRequest(res.request);
      setIsReopenModalOpen(false);
      setReason('');
      fetchRequest();
    } catch (err: any) {
      setActionError(err.message || 'Status transition failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Assignment handler (Under Review -> Assigned)
  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request || !selectedDevId) return;
    setActionError(null);
    setIsSubmitting(true);

    try {
      const res = await apiRequest<{ request: ServiceRequest }>(`/api/requests/${request.id}/assign`, {
        method: 'POST',
        body: {
          assigneeId: Number(selectedDevId),
          version: request.version,
        },
      });
      setRequest(res.request);
      setIsAssignModalOpen(false);
      setSelectedDevId('');
      fetchRequest();
    } catch (err: any) {
      setActionError(err.message || 'Assignment failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reassignment handler
  const handleReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request || !selectedDevId || !reason.trim()) return;
    setActionError(null);
    setIsSubmitting(true);

    try {
      const res = await apiRequest<{ request: ServiceRequest }>(
        `/api/requests/${request.id}/reassign`,
        {
          method: 'POST',
          body: {
            assigneeId: Number(selectedDevId),
            reason: reason.trim(),
            version: request.version,
          },
        }
      );
      setRequest(res.request);
      setIsReassignModalOpen(false);
      setSelectedDevId('');
      setReason('');
      fetchRequest();
    } catch (err: any) {
      setActionError(err.message || 'Reassignment failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-24 text-slate-400">
        <Clock className="w-6 h-6 animate-spin mr-2 text-indigo-600" />
        <span>Loading request details...</span>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800">Request Not Found</h2>
        <p className="text-slate-500 mt-1 text-sm">{error || 'This request does not exist or you lack permission to view it.'}</p>
        <button
          onClick={() => navigate('/requests')}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium"
        >
          Back to Requests
        </button>
      </div>
    );
  }

  const isAssignedDev = user?.role === 'developer' && request.assignee?.id === user.id;
  const isManager = user?.role === 'manager';

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <button
          onClick={() => navigate('/requests')}
          className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-800 transition"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Requests
        </button>
      </div>

      {actionError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm flex items-start">
          <AlertCircle className="w-5 h-5 mr-2 text-rose-500 flex-shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Main Request Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <span className="font-mono text-sm font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-md">
                {request.referenceNumber}
              </span>
              <StatusBadge status={request.status} />
              <PriorityBadge priority={request.priority} />
              {request.isOverdue && <OverdueBadge />}
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{request.title}</h1>
          </div>

          {/* Action Buttons based on Role & Status */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Manager: Edit details (if not Completed) */}
            {isManager && request.status !== 'Completed' && (
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="inline-flex items-center px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                <Edit className="w-4 h-4 mr-1.5 text-slate-500" />
                Edit
              </button>
            )}

            {/* Manager: Submitted -> Under Review */}
            {isManager && request.status === 'Submitted' && (
              <button
                onClick={() => handleTransition('Under Review')}
                disabled={isSubmitting}
                className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50"
              >
                <UserCheck className="w-4 h-4 mr-1.5" />
                Review Request
              </button>
            )}

            {/* Manager: Under Review -> Assign developer */}
            {isManager && request.status === 'Under Review' && (
              <button
                onClick={() => setIsAssignModalOpen(true)}
                className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
              >
                <UserPlus className="w-4 h-4 mr-1.5" />
                Assign Developer
              </button>
            )}

            {/* Manager: Reassign (while Assigned, In Progress, Reopened) */}
            {isManager &&
              ['Assigned', 'In Progress', 'Reopened'].includes(request.status) && (
                <button
                  onClick={() => setIsReassignModalOpen(true)}
                  className="inline-flex items-center px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                  <UserPlus className="w-4 h-4 mr-1.5 text-slate-500" />
                  Reassign
                </button>
              )}

            {/* Assigned Developer: Start work (Assigned -> In Progress) */}
            {isAssignedDev && request.status === 'Assigned' && (
              <button
                onClick={() => handleTransition('In Progress')}
                disabled={isSubmitting}
                className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50"
              >
                <Play className="w-4 h-4 mr-1.5" />
                Start Work
              </button>
            )}

            {/* Assigned Developer: Complete (In Progress -> Completed) */}
            {isAssignedDev && request.status === 'In Progress' && (
              <button
                onClick={() => handleTransition('Completed')}
                disabled={isSubmitting}
                className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Complete Request
              </button>
            )}

            {/* Manager: Reopen (Completed -> Reopened) */}
            {isManager && request.status === 'Completed' && (
              <button
                onClick={() => setIsReopenModalOpen(true)}
                className="inline-flex items-center px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
              >
                <RotateCcw className="w-4 h-4 mr-1.5" />
                Reopen Request
              </button>
            )}

            {/* Assigned Developer: Resume work (Reopened -> In Progress) */}
            {isAssignedDev && request.status === 'Reopened' && (
              <button
                onClick={() => handleTransition('In Progress')}
                disabled={isSubmitting}
                className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50"
              >
                <Play className="w-4 h-4 mr-1.5" />
                Resume Work
              </button>
            )}
          </div>
        </div>

        {/* Metadata Details Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-6 border-b border-slate-100 text-sm">
          <div>
            <span className="block text-slate-400 text-xs font-semibold uppercase">Category</span>
            <span className="font-medium text-slate-800 mt-1 block">{request.category}</span>
          </div>

          <div>
            <span className="block text-slate-400 text-xs font-semibold uppercase">Created By</span>
            <span className="font-medium text-slate-800 mt-1 block">{request.createdBy.name}</span>
          </div>

          <div>
            <span className="block text-slate-400 text-xs font-semibold uppercase">Assignee</span>
            <span className="font-medium text-slate-800 mt-1 block">
              {request.assignee ? request.assignee.name : <em className="text-slate-400">Unassigned</em>}
            </span>
          </div>

          <div>
            <span className="block text-slate-400 text-xs font-semibold uppercase">Deadline</span>
            <span className="font-medium text-slate-800 mt-1 flex items-center">
              <Calendar className="w-4 h-4 mr-1 text-slate-400" />
              {new Date(request.deadline).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Description */}
        <div className="pt-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">Description</h3>
          <p className="text-slate-700 whitespace-pre-wrap leading-relaxed text-sm bg-slate-50/60 p-4 rounded-lg border border-slate-100">
            {request.description}
          </p>
        </div>
      </div>

      {/* Audit Trail Timeline Section (For Managers) */}
      {isManager && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <div className="flex items-center space-x-2 pb-4 border-b border-slate-200 mb-6">
            <History className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">Audit History & Timeline</h2>
          </div>

          {auditLogs.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No audit records found.</p>
          ) : (
            <div className="relative border-l-2 border-slate-200 ml-3 space-y-6">
              {auditLogs.map((log) => (
                <div key={log.id} className="relative pl-6">
                  <div className="absolute -left-2 top-1.5 w-3.5 h-3.5 rounded-full bg-indigo-600 ring-4 ring-white" />
                  <div className="text-sm">
                    <span className="font-semibold text-slate-900">{log.action.replace('_', ' ')}</span>
                    <span className="text-slate-500 ml-2">by <strong className="text-slate-700">{log.actor.name}</strong> ({log.actor.role})</span>
                    <span className="text-xs text-slate-400 ml-2">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>

                  {log.reason && (
                    <div className="mt-1 text-xs text-slate-600 bg-amber-50/80 border border-amber-200 p-2 rounded-md">
                      <strong>Reason:</strong> {log.reason}
                    </div>
                  )}

                  {log.oldValue && log.newValue && (
                    <div className="mt-1 text-xs text-slate-500">
                      {JSON.stringify(log.oldValue)} → {JSON.stringify(log.newValue)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Request Modal */}
      <RequestModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        existingRequest={request}
        onSuccess={(updated) => setRequest(updated)}
      />

      {/* Assign Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Assign Developer</h3>
            <form onSubmit={handleAssign} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Select Developer</label>
                <select
                  required
                  value={selectedDevId}
                  onChange={(e) => setSelectedDevId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Choose active developer --</option>
                  {developers
                    .filter((d) => d.isActive)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.email})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedDevId}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {isReassignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Reassign Developer</h3>
            <form onSubmit={handleReassign} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">New Developer</label>
                <select
                  required
                  value={selectedDevId}
                  onChange={(e) => setSelectedDevId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Choose active developer --</option>
                  {developers
                    .filter((d) => d.isActive && d.id !== request.assignee?.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.email})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Reason for Reassignment <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why this request is being reassigned..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsReassignModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedDevId || !reason.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? 'Reassigning...' : 'Confirm Reassignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reopen Modal */}
      {isReopenModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Reopen Completed Request</h3>
            <p className="text-xs text-slate-500 mb-4">
              Reopening a request resets its completion state. You must provide a clear reason for the audit trail.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleTransition('Reopened', reason);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Reopening Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why this request needs to be reopened..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsReopenModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !reason.trim()}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? 'Reopening...' : 'Confirm Reopen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};