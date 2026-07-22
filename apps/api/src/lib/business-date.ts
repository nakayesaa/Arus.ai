import { parseBusinessDate } from '@arus/domain';

export function businessDateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = new Map<string, string>(
    parts.map((part) => [part.type, part.value]),
  );
  const year = values.get('year');
  const month = values.get('month');
  const day = values.get('day');

  if (!year || !month || !day) {
    throw new Error(`Unable to resolve business date for timezone ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
}

export function startOfBusinessDateInTimeZone(
  value: string,
  timeZone: string,
): Date {
  const businessDate = parseBusinessDate(value);
  const [year, month, day] = businessDate.split('-').map(Number);
  const target = Date.UTC(year!, month! - 1, day!);
  let instant = target;

  // Offset-only arithmetic is wrong at daylight-saving boundaries. Reconcile
  // the candidate against its actual local wall time until it reaches midnight.
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const local = localDateTimeParts(new Date(instant), timeZone);
    const localAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    const adjustment = target - localAsUtc;
    instant += adjustment;
    if (adjustment === 0) break;
  }

  const result = new Date(instant);
  if (
    businessDateInTimeZone(result, timeZone) !== businessDate ||
    localDateTimeParts(result, timeZone).hour !== 0
  ) {
    throw new Error(
      `Unable to resolve start of ${businessDate} for timezone ${timeZone}`,
    );
  }
  return result;
}

export function databaseDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function localDateTimeParts(
  value: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const values = new Map<string, string>(
    parts.map((part) => [part.type, part.value]),
  );
  const number = (type: string): number => {
    const part = values.get(type);
    if (!part) throw new Error(`Unable to resolve ${type} for ${timeZone}`);
    return Number(part);
  };

  return {
    year: number('year'),
    month: number('month'),
    day: number('day'),
    hour: number('hour'),
    minute: number('minute'),
    second: number('second'),
  };
}
