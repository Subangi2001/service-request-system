import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  RefreshCw,
  Search,
  User,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { OverdueBadge, PriorityBadge, StatusBadge } from '../components/Badges';
import { RequestModal } from '../components/RequestModal';
import { useAuth } from '../context/AuthContext';
import type { Priority, RequestStatus, ServiceRequest } from '../types/request';

const STATUS_OPTIONS: (RequestStatus | '')[] = [
  '',
  'Submitted',
  'Under Review',
  'Assigned',
  'In Progress',
  'Completed',
  'Reopened',
];

const PRIORITY_OPTIONS: (Priority | '')[] = ['', 'Low', 'Medium', 'High', 'Critical'];

export const RequestList: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read filters directly from URL search parameters
  const statusParam = searchParams.get('status') || '';
  const priorityParam = searchParams.get('priority') || '';
  const isOverdueParam = searchParams.get('isOverdue') === 'true';

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchRequests = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '10');
      params.set('sortBy', 'createdAt');
      params.set('sortOrder', 'desc');

      if (statusParam) params.set('status', statusParam);
      if (priorityParam) params.set('priority', priorityParam);
      if (isOverdueParam) params.set('isOverdue', 'true');

      const res = await apiRequest<{
        requests: ServiceRequest[];
        pagination: { total: number; totalPages: number };
      }>(`/api/requests?${params.toString()}`);

      setRequests(res.requests);
      setTotalCount(res.pagination.total);
      setTotalPages(res.pagination.totalPages || 1);
    } catch (err: any) {
      setError(err.message || 'Failed to load requests.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [page, statusParam, priorityParam, isOverdueParam]);

  const updateFilter = (key: string, value: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (value) {
      nextParams.set(key, value);
    } else {
      nextParams.delete(key);
    }
    setPage(1);
    setSearchParams(nextParams);
  };

  const clearAllFilters = () => {
    setSearchParams(new URLSearchParams());
    setPage(1);
  };

  const hasActiveFilters = Boolean(statusParam || priorityParam || isOverdueParam);

  const filteredRequests = requests.filter(
    (r) =>
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.referenceNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Service Requests</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {user?.role === 'manager'
              ? 'Manage and monitor all requests across your organization.'
              : 'Requests currently assigned to you for development and review.'}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchRequests}
            title="Refresh list"
            className="p-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {user?.role === 'manager' && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New Request
            </button>
          )}
        </div>
      </div>

      {/* Active Filter Notification Bar */}
      {hasActiveFilters && (
        <div className="bg-indigo-50 border border-indigo-200 px-4 py-2.5 rounded-lg flex items-center justify-between text-xs text-indigo-900">
          <div className="flex items-center space-x-2">
            <span className="font-semibold">Filtered by:</span>
            {statusParam && (
              <span className="bg-white px-2 py-0.5 rounded border border-indigo-200">
                Status: {statusParam}
              </span>
            )}
            {priorityParam && (
              <span className="bg-white px-2 py-0.5 rounded border border-indigo-200">
                Priority: {priorityParam}
              </span>
            )}
            {isOverdueParam && (
              <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded font-semibold border border-rose-200">
                Overdue Only
              </span>
            )}
          </div>
          <button
            onClick={clearAllFilters}
            className="inline-flex items-center text-indigo-600 hover:text-indigo-800 font-semibold"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Clear Filters
          </button>
        </div>
      )}

      {/* Filters and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reference or title..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={statusParam.includes(',') ? '' : statusParam}
              onChange={(e) => updateFilter('status', e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">
                {statusParam.includes(',') ? `Multiple (${statusParam})` : 'All Statuses'}
              </option>
              {STATUS_OPTIONS.filter(Boolean).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={priorityParam}
              onChange={(e) => updateFilter('priority', e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Priorities</option>
              {PRIORITY_OPTIONS.filter(Boolean).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm flex items-center">
          <AlertCircle className="w-5 h-5 mr-2 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Requests Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-semibold">
              <tr>
                <th className="px-6 py-3.5">Reference</th>
                <th className="px-6 py-3.5">Title</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Priority</th>
                <th className="px-6 py-3.5">Assignee</th>
                <th className="px-6 py-3.5">Deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center space-x-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                      <span>Loading service requests...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    No requests found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => (
                  <tr
                    key={req.id}
                    onClick={() => navigate(`/requests/${req.id}`)}
                    className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 font-mono font-medium text-indigo-600 whitespace-nowrap">
                      {req.referenceNumber}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900 line-clamp-1">{req.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{req.category}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={req.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <PriorityBadge priority={req.priority} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                      {req.assignee ? (
                        <span className="inline-flex items-center text-xs">
                          <User className="w-3.5 h-3.5 mr-1 text-slate-400" />
                          {req.assignee.name}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs">
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-600 flex items-center">
                          <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
                          {new Date(req.deadline).toLocaleDateString()}
                        </span>
                        {req.isOverdue && <OverdueBadge />}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-200 flex items-center justify-between text-sm text-slate-600">
          <div>
            Showing <span className="font-semibold">{filteredRequests.length}</span> of{' '}
            <span className="font-semibold">{totalCount}</span> requests
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 border border-slate-300 rounded-md hover:bg-slate-100 disabled:opacity-40 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium px-2">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 border border-slate-300 rounded-md hover:bg-slate-100 disabled:opacity-40 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* New Request Modal */}
      <RequestModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          fetchRequests();
        }}
      />
    </div>
  );
};