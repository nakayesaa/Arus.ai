import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { buildUrl, type PageSearchParams } from '@/lib/url-query';

interface PaginationNavProps {
  path: string;
  searchParams: PageSearchParams;
  page: number;
  totalPages: number;
  total: number;
  pageKey?: string;
}

export function PaginationNav({
  path,
  searchParams,
  page,
  totalPages,
  total,
  pageKey = 'page',
}: PaginationNavProps) {
  if (totalPages <= 1) {
    return (
      <footer className="pagination-nav pagination-nav-single">
        <span>{total === 1 ? '1 record' : `${total} records`}</span>
      </footer>
    );
  }

  return (
    <nav className="pagination-nav" aria-label="Pagination">
      <span>
        Page {page} of {totalPages} · {total} records
      </span>
      <div>
        {page > 1 ? (
          <Link
            className="control-button icon-control"
            href={buildUrl(path, searchParams, { [pageKey]: page - 1 })}
            aria-label="Previous page"
          >
            <ChevronLeft size={15} />
          </Link>
        ) : (
          <span
            className="control-button icon-control control-disabled"
            aria-hidden="true"
          >
            <ChevronLeft size={15} />
          </span>
        )}
        {page < totalPages ? (
          <Link
            className="control-button icon-control"
            href={buildUrl(path, searchParams, { [pageKey]: page + 1 })}
            aria-label="Next page"
          >
            <ChevronRight size={15} />
          </Link>
        ) : (
          <span
            className="control-button icon-control control-disabled"
            aria-hidden="true"
          >
            <ChevronRight size={15} />
          </span>
        )}
      </div>
    </nav>
  );
}
