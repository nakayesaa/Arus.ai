import { GooeyInput } from '@/components/ui/gooey-input';

interface SearchControlProps {
  placeholder: string;
  variant?: 'compact' | 'sidebar';
}

export function SearchControl({
  placeholder,
  variant = 'compact',
}: SearchControlProps) {
  const sidebar = variant === 'sidebar';

  return (
    <GooeyInput
      placeholder={placeholder}
      collapsedWidth={sidebar ? 218 : 142}
      expandedWidth={sidebar ? 172 : 184}
      expandedOffset={sidebar ? 46 : 42}
      gooeyBlur={4}
      className={sidebar ? 'sidebar-gooey-search' : 'data-search-control'}
      classNames={{
        trigger: 'arus-search-trigger',
        input: 'arus-search-input',
        bubbleSurface: 'arus-search-bubble',
      }}
    />
  );
}
