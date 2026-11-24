import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock,
  FileText,
  ListTodo,
  PlayCircle,
  RefreshCw,
  Users,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';

type ManagerData = {
  counts: {
    total: number;
    pending: number;
    active: number;
    completed: number;
    overdue: number;
  };
  workload: Array<{
    id: number;
    name: string;
    email: string;
    activeRequestsCount: number;
  }>;
};

type DeveloperData = {
  counts: {
    total: number;
    pendingAction: number;
    inProgress: number;
    completed: number;
    overdue: number;
  };
};

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [managerData, setManagerData] = useState<ManagerData | null>(null);
  const [developerData, setDeveloperData] = useState<DeveloperData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (user?.role === 'manager') {
        const res = await apiRequest<ManagerData>('/api/dashboard');
        setManagerData(res);
      } else if (user?.role === 'developer') {
        const res = await apiRequest<DeveloperData>('/api/dashboard');
        setDeveloperData(res);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard metrics.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-24 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2 text-indigo-600" />
        <span>Loading dashboard statistics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm flex items-center justify-between">
        <span>{error}</span>
        <button
          onClick={fetchDashboard}
          className="text-xs font-semibold underline hover:text-rose-900"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Dashboard Overview
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {user?.role === 'manager'
              ? `Operational metrics and team workload for ${user.organization?.name || 'your organization'}.`
              : `Your active assignments and personal workload overview.`}
          </p>
        </div>

        <button
          onClick={() => navigate('/requests')}
          className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 transition self-start sm:self-auto"
        >
          View All Requests
          <ArrowRight className="w-4 h-4 ml-1.5" />
        </button>
      </div>

      {/* MANAGER VIEW */}
      {user?.role === 'manager' && managerData && (
        <>
          {/* 5 Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Total */}
            <div
              onClick={() => navigate('/requests')}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow transition cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Total
                </span>
                <div className="p-2 bg-slate-100 text-slate-600 rounded-lg">
                  <FileText className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 text-3xl font-extrabold text-slate-900">
                {managerData.counts.total}
              </div>
              <p className="mt-1 text-xs text-slate-400">All submitted tickets</p>
            </div>

            {/* Pending (Submitted + Under Review) */}
            <div
              onClick={() => navigate('/requests?status=Submitted,Under Review')}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-sky-300 hover:shadow transition cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                  Pending
                </span>
                <div className="p-2 bg-sky-50 text-sky-600 rounded-lg">
                  <ListTodo className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 text-3xl font-extrabold text-sky-950">
                {managerData.counts.pending}
              </div>
              <p className="mt-1 text-xs text-slate-400">Submitted & Under Review</p>
            </div>

            {/* Active (Assigned + In Progress + Reopened) */}
            <div
              onClick={() => navigate('/requests?status=Assigned,In Progress,Reopened')}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-amber-300 hover:shadow transition cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  Active
                </span>
                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                  <PlayCircle className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 text-3xl font-extrabold text-amber-950">
                {managerData.counts.active}
              </div>
              <p className="mt-1 text-xs text-slate-400">Assigned, Progress, Reopened</p>
            </div>

            {/* Completed */}
            <div
              onClick={() => navigate('/requests?status=Completed')}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-emerald-300 hover:shadow transition cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Completed
                </span>
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 text-3xl font-extrabold text-emerald-950">
                {managerData.counts.completed}
              </div>
              <p className="mt-1 text-xs text-slate-400">Successfully resolved</p>
            </div>

            {/* Overdue */}
            <div
              onClick={() => navigate('/requests?isOverdue=true')}
              className="bg-white p-5 rounded-xl border border-rose-200 shadow-sm hover:border-rose-400 hover:shadow transition cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-rose-600">
                  Overdue
                </span>
                <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 text-3xl font-extrabold text-rose-600">
                {managerData.counts.overdue}
              </div>
              <p className="mt-1 text-xs text-slate-400">Past deadline & open</p>
            </div>
          </div>

          {/* Developer Workload Section */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-900">Developer Workload Distribution</h2>
              </div>
              <span className="text-xs text-slate-400">
                Active tickets per developer (Assigned, In Progress, Reopened)
              </span>
            </div>

            {managerData.workload.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                No active developers found in your organization. Go to the{' '}
                <button
                  onClick={() => navigate('/members')}
                  className="text-indigo-600 underline font-semibold"
                >
                  Developers
                </button>{' '}
                tab to add team members.
              </div>
            ) : (
              <div className="space-y-4">
                {managerData.workload.map((dev) => {
                  const maxDisplay = Math.max(
                    ...managerData.workload.map((w) => w.activeRequestsCount),
                    5
                  );
                  const percentage = Math.round((dev.activeRequestsCount / maxDisplay) * 100);

                  return (
                    <div
                      key={dev.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-slate-50/70 rounded-lg border border-slate-100 gap-3"
                    >
                      <div className="min-w-[180px]">
                        <div className="font-semibold text-slate-800 text-sm">{dev.name}</div>
                        <div className="text-xs text-slate-400">{dev.email}</div>
                      </div>

                      {/* Visual Progress Bar */}
                      <div className="flex-1 max-w-md mx-0 sm:mx-4">
                        <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-2.5 rounded-full ${
                              dev.activeRequestsCount >= 4
                                ? 'bg-rose-500'
                                : dev.activeRequestsCount >= 2
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.max(percentage, 5)}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-white border border-slate-200 text-slate-700 shadow-sm">
                          {dev.activeRequestsCount}{' '}
                          {dev.activeRequestsCount === 1 ? 'ticket' : 'tickets'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* DEVELOPER VIEW */}
      {user?.role === 'developer' && developerData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Total Assigned */}
          <div
            onClick={() => navigate('/requests')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow transition cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Assigned
              </span>
              <div className="p-2 bg-slate-100 text-slate-600 rounded-lg">
                <Briefcase className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-extrabold text-slate-900">
              {developerData.counts.total}
            </div>
            <p className="mt-1 text-xs text-slate-400">All tickets assigned to you</p>
          </div>

          {/* Pending Action (Assigned + Reopened) */}
          <div
            onClick={() => navigate('/requests?status=Assigned,Reopened')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-sky-300 hover:shadow transition cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                Pending Action
              </span>
              <div className="p-2 bg-sky-50 text-sky-600 rounded-lg">
                <ListTodo className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-extrabold text-sky-950">
              {developerData.counts.pendingAction}
            </div>
            <p className="mt-1 text-xs text-slate-400">Assigned & Reopened (waiting to start)</p>
          </div>

          {/* In Progress */}
          <div
            onClick={() => navigate('/requests?status=In Progress')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-amber-300 hover:shadow transition cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                In Progress
              </span>
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <PlayCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-extrabold text-amber-950">
              {developerData.counts.inProgress}
            </div>
            <p className="mt-1 text-xs text-slate-400">Currently being worked on</p>
          </div>

          {/* Completed */}
          <div
            onClick={() => navigate('/requests?status=Completed')}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-emerald-300 hover:shadow transition cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Completed
              </span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-extrabold text-emerald-950">
              {developerData.counts.completed}
            </div>
            <p className="mt-1 text-xs text-slate-400">Finished requests</p>
          </div>

          {/* Overdue */}
          <div
            onClick={() => navigate('/requests?isOverdue=true')}
            className="bg-white p-5 rounded-xl border border-rose-200 shadow-sm hover:border-rose-400 hover:shadow transition cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-600">
                Overdue
              </span>
              <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-extrabold text-rose-600">
              {developerData.counts.overdue}
            </div>
            <p className="mt-1 text-xs text-slate-400">Passed deadline</p>
          </div>
        </div>
      )}
    </div>
  );
};