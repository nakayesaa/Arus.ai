import { serverApiRequest } from '@/lib/api-client/server';

import {
  weeklyReportResponseSchema,
  type WeeklyReportResponse,
} from './contracts';

export function getWeeklyReport(period?: {
  from: string;
  to: string;
}): Promise<WeeklyReportResponse> {
  const query = period ? `?${new URLSearchParams(period).toString()}` : '';
  return serverApiRequest(
    `/api/reports/weekly${query}`,
    weeklyReportResponseSchema,
  );
}
