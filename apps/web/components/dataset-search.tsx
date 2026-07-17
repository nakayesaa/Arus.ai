'use client';

import { Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useState,
  useTransition,
} from 'react';

import { urlWithChanges } from '@/lib/url-query';

interface DatasetSearchProps {
  value: string;
  placeholder: string;
  label: string;
}

export function DatasetSearch({
  value: initialValue,
  placeholder,
  label,
}: DatasetSearchProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputId = useId();
  const currentQuery = searchParams.toString();
  const [value, setValue] = useState(initialValue);
  const [isPending, startTransition] = useTransition();

  useEffect(() => setValue(initialValue), [initialValue]);

  const commit = useCallback(
    (nextValue: string) => {
      const target = urlWithChanges(pathname, currentQuery, {
        search: nextValue.trim() || null,
        page: null,
      });
      const current = currentQuery ? `${pathname}?${currentQuery}` : pathname;
      if (target === current) return;
      startTransition(() => router.replace(target, { scroll: false }));
    },
    [currentQuery, pathname, router],
  );

  useEffect(() => {
    if (value.trim() === initialValue) return;
    const timeout = window.setTimeout(() => commit(value), 300);
    return () => window.clearTimeout(timeout);
  }, [commit, initialValue, value]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commit(value);
  }

  function clear() {
    setValue('');
    commit('');
  }

  return (
    <form
      className="dataset-search"
      role="search"
      aria-label={label}
      onSubmit={submit}
    >
      <Search size={14} aria-hidden="true" />
      <label className="visually-hidden" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        type="search"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        maxLength={200}
        aria-busy={isPending}
        onChange={(event) => setValue(event.target.value)}
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={clear}>
          <X size={13} aria-hidden="true" />
        </button>
      )}
    </form>
  );
}
