import { GooeyInput } from '@/components/ui/gooey-input';

interface SearchControlProps {
  placeholder: string;
}

export function SearchControl({ placeholder }: SearchControlProps) {
  return (
    <GooeyInput
      placeholder={placeholder}
      collapsedWidth={142}
      expandedWidth={184}
      expandedOffset={42}
      gooeyBlur={4}
      className="data-search-control"
      classNames={{
        trigger: 'arus-search-trigger',
        input: 'arus-search-input',
        bubbleSurface: 'arus-search-bubble',
      }}
    />
  );
}
