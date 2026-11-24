export type Priority = 'Low' | 'Medium' | 'High' | 'Critical';

export type Category = 'Bug Fix' | 'New Feature' | 'Maintenance' | 'Technical Support' | 'Other';

export type RequestStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Assigned'
  | 'In Progress'
  | 'Completed'
  | 'Reopened';

export type ServiceRequest = {
  id: number;
  referenceNumber: string;
  title: string;
  description: string;
  priority: Priority;
  category: Category;
  status: RequestStatus;
  organizationId: number;
  createdBy: {
    id: number;
    name: string;
  };
  assignee: {
    id: number;
    name: string;
  } | null;
  deadline: string;
  completedAt: string | null;
  isOverdue: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AuditLogEntry = {
  id: number;
  action: string;
  oldValue: any;
  newValue: any;
  reason: string | null;
  createdAt: string;
  actor: {
    id: number;
    name: string;
    role: string;
  };
};

export type DeveloperOption = {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
};