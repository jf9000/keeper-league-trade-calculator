/**
 * The "keeper" mark shown beside the title: a football (laces and end stripes) with a padlock tucked into its
 * corner. Flat and single-colour, drawn in `currentColor` (the accent colour) so it follows the theme.
 */
export function FootballLock({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`text-ac ${className}`} aria-hidden="true">
      <mask id="football-lock-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
        <rect width="64" height="64" fill="#fff" />
        <g transform="rotate(-35 32 32)" fill="none" stroke="#000" strokeWidth="2.4" strokeLinecap="round">
          <path d="M17 21q-4 11 0 22M47 21q4 11 0 22" />
          <path d="M26 32h12M28.5 28.5v7M32 28v8M35.5 28.5v7" />
        </g>
        <circle cx="50" cy="49" r="12.5" fill="#000" />
      </mask>
      <g mask="url(#football-lock-cut)">
        <path transform="rotate(-35 32 32)" d="M3 32C13 8 51 8 61 32C51 56 13 56 3 32Z" fill="currentColor" />
      </g>
      <path d="M45.5 47v-3a4.5 4.5 0 0 1 9 0v3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <rect x="42" y="46" width="16" height="12" rx="3" fill="currentColor" />
    </svg>
  )
}
