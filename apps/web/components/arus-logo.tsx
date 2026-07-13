import Image from 'next/image';

export function ArusLogo({ className }: { className?: string }) {
  return (
    <span className={`arus-logo ${className ?? ''}`}>
      <Image
        src="/brand/arus-logo.png"
        alt="Arus"
        width={240}
        height={160}
        priority
      />
    </span>
  );
}
