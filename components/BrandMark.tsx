type BrandMarkProps = {
  size?: number;
  className?: string;
};

export function BrandMark({ size = 24, className = "" }: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={`text-brand ${className}`}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path
        d="M4 11c0-4 3.6-7 8-7s8 3 8 7l-1.5 6.5c-.3 1.2-1.2 2-2.4 2H7.9c-1.2 0-2.1-.8-2.4-2L4 11Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M7 5.5 8.5 9M17 5.5 15.5 9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <circle cx="9.5" cy="12.5" fill="currentColor" r="1" />
      <circle cx="14.5" cy="12.5" fill="currentColor" r="1" />
      <path d="M10.5 15.5h3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
    </svg>
  );
}
