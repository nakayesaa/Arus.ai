'use client';

import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import { cn } from '@/lib/utils';

function GooeyFilter({ filterId, blur }: { filterId: string; blur: number }) {
  return (
    <svg className="absolute hidden h-0 w-0" aria-hidden>
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur
            in="SourceGraphic"
            stdDeviation={blur}
            result="blur"
          />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      className="size-4 shrink-0"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export interface GooeyInputClassNames {
  root?: string;
  filterWrap?: string;
  buttonRow?: string;
  trigger?: string;
  input?: string;
  bubble?: string;
  bubbleSurface?: string;
}

export interface GooeyInputProps {
  placeholder?: string;
  buttonLabel?: string;
  className?: string;
  classNames?: GooeyInputClassNames;
  /** Collapsed control width in px */
  collapsedWidth?: number;
  /** Expanded control width in px */
  expandedWidth?: number;
  /** Horizontal offset when expanded (px), aligns detached bubble */
  expandedOffset?: number;
  /** Gaussian blur amount for the gooey SVG filter */
  gooeyBlur?: number;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}

export function GooeyInput({
  placeholder = 'Type to search...',
  buttonLabel = 'Search',
  className,
  classNames,
  collapsedWidth = 115,
  expandedWidth = 200,
  expandedOffset = 50,
  gooeyBlur = 5,
  value: valueProp,
  defaultValue = '',
  onValueChange,
  onOpenChange,
  disabled = false,
}: GooeyInputProps) {
  const reactId = useId();
  const safeId = reactId.replace(/:/g, '');
  const filterId = `gooey-filter-${safeId}`;

  const inputRef = useRef<HTMLInputElement>(null);
  const prevExpandedRef = useRef(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);

  const isControlled = valueProp !== undefined;
  const searchText = isControlled ? valueProp : uncontrolledValue;

  const setSearchText = useCallback(
    (next: string) => {
      if (!isControlled) {
        setUncontrolledValue(next);
      }
      onValueChange?.(next);
    },
    [isControlled, onValueChange],
  );

  const setExpanded = useCallback(
    (next: boolean) => {
      setIsExpanded(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  useEffect(() => {
    if (isExpanded) {
      inputRef.current?.focus();
    } else if (prevExpandedRef.current) {
      setSearchText('');
    }
    prevExpandedRef.current = isExpanded;
  }, [isExpanded, setSearchText]);

  function handleExpand() {
    if (!disabled) setExpanded(true);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setSearchText(event.target.value);
  }

  function handleBlur() {
    if (!searchText) setExpanded(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setExpanded(false);
    }
  }

  const surfaceClass = 'bg-foreground text-background shadow-sm';

  return (
    <div
      className={cn(
        'relative flex items-center justify-center',
        className,
        classNames?.root,
      )}
    >
      <GooeyFilter filterId={filterId} blur={gooeyBlur} />

      <div
        className={cn(
          'relative flex h-10 items-center justify-center',
          classNames?.filterWrap,
        )}
        style={{ contain: 'layout paint', filter: `url(#${filterId})` }}
      >
        <div
          className={cn(
            'flex h-10 items-center justify-center transition-[width,transform] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)]',
            classNames?.buttonRow,
          )}
          style={{
            width: isExpanded ? expandedWidth : collapsedWidth,
            transform: `translateX(${isExpanded ? expandedOffset : 0}px)`,
          }}
        >
          {isExpanded ? (
            <div
              className={cn(
                'flex h-10 w-full items-center rounded-full px-4',
                surfaceClass,
                classNames?.trigger,
              )}
            >
              <input
                ref={inputRef}
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                value={searchText}
                onChange={handleChange}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                placeholder={placeholder}
                aria-label={placeholder}
                className={cn(
                  'h-full min-w-0 flex-1 bg-transparent text-sm text-background outline-none placeholder:text-background/50 dark:placeholder:text-background/45',
                  classNames?.input,
                )}
              />
            </div>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={handleExpand}
              aria-label={`Open ${placeholder.toLowerCase()}`}
              className={cn(
                'flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50',
                surfaceClass,
                classNames?.trigger,
              )}
            >
              <SearchIcon />
              <span className="truncate">{buttonLabel}</span>
            </button>
          )}
        </div>

        <div
          aria-hidden={!isExpanded}
          className={cn(
            'absolute top-1/2 left-0 flex size-10 -translate-y-1/2 items-center justify-center transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)]',
            isExpanded
              ? 'scale-100 opacity-100'
              : 'pointer-events-none scale-75 opacity-0',
            classNames?.bubble,
          )}
        >
          <div
            className={cn(
              'flex size-10 items-center justify-center rounded-full',
              surfaceClass,
              classNames?.bubbleSurface,
            )}
          >
            <SearchIcon />
          </div>
        </div>
      </div>
    </div>
  );
}
