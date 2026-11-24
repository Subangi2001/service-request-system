import { AlertCircle, X } from 'lucide-react';
import React, { useState } from 'react';
import { apiRequest } from '../api/client';
import type { Category, Priority, ServiceRequest } from '../types/request';

type RequestModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (request: ServiceRequest) => void;
  existingRequest?: ServiceRequest | null;
};

const CATEGORIES: Category[] = [
  'Bug Fix',
  'New Feature',
  'Maintenance',
  'Technical Support',
  'Other',
];

const PRIORITIES: Priority[] = ['Low', 'Medium', 'High', 'Critical'];

export const RequestModal: React.FC<RequestModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingRequest,
}) => {
  const isEditing = !!existingRequest;

  // Initialize deadline to 7 days in the future for new requests
  const defaultDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);

  const [title, setTitle] = useState(existingRequest?.title || '');
  const [description, setDescription] = useState(existingRequest?.description || '');
  const [priority, setPriority] = useState<Priority>(existingRequest?.priority || 'Medium');
  const [category, setCategory] = useState<Category>(existingRequest?.category || 'Bug Fix');
  const [deadline, setDeadline] = useState(
    existingRequest
      ? new Date(existingRequest.deadline).toISOString().slice(0, 16)
      : defaultDeadline
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (isEditing) {
        // PATCH /api/requests/:id with optimistic concurrency version check
        const res = await apiRequest<{ request: ServiceRequest }>(
          `/api/requests/${existingRequest.id}`,
          {
            method: 'PATCH',
            body: {
              version: existingRequest.version,
              title: title.trim(),
              description: description.trim(),
              priority,
              category,
              deadline: new Date(deadline).toISOString(),
            },
          }
        );
        onSuccess(res.request);
      } else {
        // POST /api/requests
        const res = await apiRequest<{ request: ServiceRequest }>('/api/requests', {
          method: 'POST',
          body: {
            title: title.trim(),
            description: description.trim(),
            priority,
            category,
            deadline: new Date(deadline).toISOString(),
          },
        });
        onSuccess(res.request);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">
            {isEditing ? `Edit Request: ${existingRequest.referenceNumber}` : 'Create New Request'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm flex items-start">
            <AlertCircle className="w-5 h-5 mr-2 text-rose-500 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fix login session timeout on mobile"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide complete details of the issue or requirement..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Deadline <span className="text-rose-500">*</span>
            </label>
            <input
              type="datetime-local"
              required
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};