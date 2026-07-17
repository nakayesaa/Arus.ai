const canonicalMoneyPattern = /^(\d+)\.(\d{2})$/;
const canonicalDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const compactNumber = new Intl.NumberFormat('id-ID');
const shortDate = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatRupiah(value: string): string {
  const match = canonicalMoneyPattern.exec(value);
  if (!match) throw new Error(`Invalid canonical money: ${value}`);

  const integer = stripLeadingZeroes(match[1] ?? '');
  const fraction = match[2] ?? '00';
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp\u00a0${grouped}${fraction === '00' ? '' : `,${fraction}`}`;
}

export function formatCompactNumber(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid non-negative count: ${value}`);
  }
  return compactNumber.format(value);
}

export function formatBusinessDate(value: string): string {
  const match = canonicalDatePattern.exec(value);
  if (!match) throw new Error(`Invalid business date: ${value}`);

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    throw new Error(`Invalid business date: ${value}`);
  }
  return shortDate.format(date);
}

export function initials(value: string): string {
  const words = value.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return '—';
  const first = words[0]?.[0] ?? '';
  const second = words.length > 1 ? (words.at(-1)?.[0] ?? '') : '';
  return `${first}${second}`.toLocaleUpperCase('id-ID');
}

export function humanizeEnum(value: string): string {
  const normalized = value.toLocaleLowerCase('en-US').replaceAll('_', ' ');
  return normalized.replace(/^\p{L}/u, (character) =>
    character.toLocaleUpperCase('en-US'),
  );
}

export function formatDuePosition(input: {
  daysToDue: number;
  daysOverdue: number;
}): string {
  if (
    !Number.isSafeInteger(input.daysToDue) ||
    !Number.isSafeInteger(input.daysOverdue) ||
    input.daysOverdue < 0
  ) {
    throw new Error('Invalid invoice aging position');
  }
  if (input.daysOverdue > 0) {
    return `${formatCompactNumber(input.daysOverdue)} ${input.daysOverdue === 1 ? 'day' : 'days'} overdue`;
  }
  if (input.daysToDue === 0) return 'Due today';
  if (input.daysToDue === 1) return 'Due tomorrow';
  if (input.daysToDue > 1) {
    return `Due in ${formatCompactNumber(input.daysToDue)} days`;
  }
  throw new Error('Invoice aging position is inconsistent');
}

function stripLeadingZeroes(value: string): string {
  return value.replace(/^0+(?=\d)/, '') || '0';
}
