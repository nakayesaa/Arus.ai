'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { urlWithChanges } from '@/lib/url-query';

interface DatasetSelectProps {
  label: string;
  queryKey: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export function DatasetSelect({
  label,
  queryKey,
  value,
  options,
}: DatasetSelectProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  return (
    <label className="dataset-select">
      <span className="visually-hidden">{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={isPending}
        onChange={(event) => {
          const target = urlWithChanges(pathname, searchParams.toString(), {
            [queryKey]: event.target.value || null,
            page: null,
          });
          startTransition(() => router.replace(target, { scroll: false }));
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
