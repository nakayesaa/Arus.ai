import Image from 'next/image';

export function ArusLogo({ className }: { className?: string }) {
  return (
    <span className={`arus-logo ${className ?? ''}`}>
      <Image
        src="/brand/arus-logo-transparent.png"
        alt="Arus"
        width={211}
        height={70}
        priority
      />
    </span>
  );
}
