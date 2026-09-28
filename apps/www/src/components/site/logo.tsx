export function Logo({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" height="20" viewBox="0 0 24 24" width="20">
      <rect height="18" rx="4" stroke="currentColor" strokeWidth="2" width="18" x="3" y="3" />
      <path d="m3 16 5-5 4 4 3-3 6 6" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
      <circle cx="15.5" cy="8.5" fill="currentColor" r="1.5" />
    </svg>
  );
}
