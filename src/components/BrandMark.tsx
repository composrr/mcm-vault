interface BrandMarkProps {
  width?: number;
  height?: number;
  className?: string;
}

export function BrandMark({ width = 32, height = 24, className }: BrandMarkProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 32 24"
      className={className}
      aria-label="MCM Vault"
    >
      <rect x="0" y="0" width="32" height="4.5" rx="1" fill="#3B6EA8" />
      <rect x="0" y="6.5" width="32" height="4.5" rx="1" fill="#3B6EA8" fillOpacity="0.7" />
      <rect x="0" y="13" width="32" height="4.5" rx="1" fill="#3B6EA8" fillOpacity="0.45" />
      <rect x="0" y="19.5" width="32" height="4.5" rx="1" fill="#3B6EA8" fillOpacity="0.25" />
    </svg>
  );
}
