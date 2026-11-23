// The fixed lists from the assessment PDF (section 5.2) and the candidate's decision D7 (categories).
// The same values are enforced by the database (CHECK constraints in the migrations).

export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CATEGORIES = ['Bug Fix', 'New Feature', 'Maintenance', 'Technical Support', 'Other'] as const;
export type Category = (typeof CATEGORIES)[number];

export const STATUSES = ['Submitted', 'Under Review', 'Assigned', 'In Progress', 'Completed', 'Reopened'] as const;
export type RequestStatus = (typeof STATUSES)[number];