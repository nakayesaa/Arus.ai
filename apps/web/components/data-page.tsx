import {
  ArrowDownToLine,
  ArrowUpDown,
  Filter,
  Plus,
  Search,
  Upload,
} from 'lucide-react';
import type { ReactNode } from 'react';

interface DataPageProps {
  title: string;
  recordLabel: string;
  pageLabel: string;
  searchPlaceholder: string;
  primaryLabel: string;
  children: ReactNode;
  extraAction?: ReactNode;
}

export function DataPage({
  title,
  recordLabel,
  pageLabel,
  searchPlaceholder,
  primaryLabel,
  children,
  extraAction,
}: DataPageProps) {
  return (
    <section className="data-page">
      <header className="data-topbar">
        <div className="data-title-block">
          <div className="data-title-line">
            <h1>{title}</h1>
            <span>{recordLabel}</span>
          </div>
          <p>{pageLabel}</p>
        </div>

        <div className="data-actions">
          <label className="compact-search">
            <Search size={14} aria-hidden="true" />
            <input type="search" placeholder={searchPlaceholder} />
          </label>
          <button className="control-button" type="button">
            <Filter size={14} />
            Filter
          </button>
          <button className="control-button" type="button">
            <ArrowUpDown size={14} />
            Sort
          </button>
          {extraAction}
          <button className="control-button wide-control" type="button">
            <Upload size={14} />
            Import
          </button>
          <button className="control-button wide-control" type="button">
            <ArrowDownToLine size={14} />
            Export
          </button>
          <button className="primary-button" type="button">
            <Plus size={15} />
            {primaryLabel}
          </button>
        </div>
      </header>

      <div className="data-table-wrap">{children}</div>
    </section>
  );
}
