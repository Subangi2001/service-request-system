import { AlertTriangle, Clock } from 'lucide-react';
import React from 'react';
import type { Priority, RequestStatus } from '../types/request';

export const StatusBadge: React.FC<{ status: RequestStatus }> = ({ status }) => {
  const styles: Record<RequestStatus, string> = {
    Submitted: 'bg-slate-100 text-slate-700 border-slate-200',
    'Under Review': 'bg-sky-50 text-sky-700 border-sky-200',
    Assigned: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    'In Progress': 'bg-amber-50 text-amber-700 border-amber-200',
    Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Reopened: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
        styles[status] || 'bg-slate-100 text-slate-700 border-slate-200'
      }`}
    >
      {status}
    </span>
  );
};

export const PriorityBadge: React.FC<{ priority: Priority }> = ({ priority }) => {
  const styles: Record<Priority, string> = {
    Low: 'bg-slate-100 text-slate-600 border-slate-200',
    Medium: 'bg-blue-50 text-blue-700 border-blue-200',
    High: 'bg-amber-50 text-amber-700 border-amber-200',
    Critical: 'bg-rose-100 text-rose-800 border-rose-300 font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
        styles[priority] || 'bg-slate-100 text-slate-600 border-slate-200'
      }`}
    >
      {priority === 'Critical' && <AlertTriangle className="w-3 h-3 mr-1 text-rose-600" />}
      {priority}
    </span>
  );
};

export const OverdueBadge: React.FC = () => {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-600 text-white shadow-sm">
      <Clock className="w-3 h-3 mr-1" />
      Overdue
    </span>
  );
};
