import Image from 'next/image';

export function ArusLogo({ className }: { className?: string }) {
  return (
    <span className={`arus-logo ${className ?? ''}`}>
      <Image
        src="/brand/arus-logo-transparent.png"
        alt="Arus"
        width={2172}
        height={724}
        priority
      />
    </span>
  );
}
