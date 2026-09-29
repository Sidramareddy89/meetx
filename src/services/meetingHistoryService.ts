export type MeetingHistoryPeriod = '1day' | '1week' | '1month' | 'all' | 'custom';

export interface MeetingHistoryRange {
  period: MeetingHistoryPeriod;
  startDate?: string;
  endDate?: string;
  now?: number;
}

/** Compare the stored numeric meeting timestamp against explicit date bounds. */
export function matchesMeetingHistoryRange(createdAt: number, range: MeetingHistoryRange): boolean {
  if (!Number.isFinite(createdAt) || createdAt <= 0) return false;
  if (range.period === 'all') return true;
  if (range.period === 'custom') {
    const start = range.startDate ? new Date(`${range.startDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const end = range.endDate ? new Date(`${range.endDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    if ((range.startDate && !Number.isFinite(start)) || (range.endDate && !Number.isFinite(end)) || start > end) return false;
    return createdAt >= start && createdAt <= end;
  }

  const now = range.now ?? Date.now();
  const boundary = new Date(now);
  if (range.period === '1day') boundary.setTime(now - 24 * 60 * 60 * 1000);
  else if (range.period === '1week') boundary.setTime(now - 7 * 24 * 60 * 60 * 1000);
  else boundary.setMonth(boundary.getMonth() - 1);
  return createdAt >= boundary.getTime() && createdAt <= now;
}
