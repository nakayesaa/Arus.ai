import { serverApiRequest } from '@/lib/api-client/server';

import { dashboardResponseSchema, type DashboardResponse } from './contracts';

export function getDashboard(asOfDate?: string): Promise<DashboardResponse> {
  const query = new URLSearchParams();
  if (asOfDate) query.set('asOfDate', asOfDate);
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return serverApiRequest(`/api/dashboard${suffix}`, dashboardResponseSchema);
}
