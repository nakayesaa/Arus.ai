import { apiRequest } from '../api-client/http';

import {
  dashboardWorkflowCasesQuery,
  dashboardWorkflowCasesResponseSchema,
  type DashboardWorkflowCasesResponse,
  type DashboardWorkflowKind,
} from './contracts';

export function listDashboardWorkflowCases(input: {
  kind: DashboardWorkflowKind;
  asOfDate: string;
  page: number;
  limit: number;
  signal?: AbortSignal | undefined;
}): Promise<DashboardWorkflowCasesResponse> {
  const query = dashboardWorkflowCasesQuery(input);
  return apiRequest(
    `/api/dashboard/workflow-cases?${query}`,
    input.signal ? { signal: input.signal } : {},
    dashboardWorkflowCasesResponseSchema,
  );
}
