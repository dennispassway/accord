/** Kleine inline iconen, 14px, currentColor. Geen icon-library, geen emoji. */

interface IconProps {
  className?: string;
}

const SIZE = 14;

export function RefreshIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width={SIZE}
      height={SIZE}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13.5 8a5.5 5.5 0 1 1-1.68-3.96" />
      <path d="M13.5 2.5v3.5H10" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width={SIZE}
      height={SIZE}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M13.5 13.5 10.4 10.4" />
    </svg>
  );
}

export function ExternalLinkIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width={SIZE}
      height={SIZE}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6.5 2.5h-3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3" />
      <path d="M9.5 2.5h4v4" />
      <path d="M13.2 2.8 7 9" />
    </svg>
  );
}

export function StackIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width={SIZE}
      height={SIZE}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2 2.5 5 8 8l5.5-3z" />
      <path d="M2.5 8 8 11l5.5-3" />
      <path d="M2.5 11 8 14l5.5-3" />
    </svg>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7.5h8" />
      <path d="M17.5 7.5H20" />
      <circle cx="14.7" cy="7.5" r="2.2" />
      <path d="M4 16.5h3" />
      <path d="M12.5 16.5H20" />
      <circle cx="9.7" cy="16.5" r="2.2" />
    </svg>
  );
}

export function SortIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M6.5 12h11" />
      <path d="M9.5 17h5" />
    </svg>
  );
}

export function ChevronIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.5 5.5l6.5 6.5-6.5 6.5" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

export function GithubIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2.2a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.9c-2.7.6-3.3-1.2-3.3-1.2-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.4-2.2-.2-4.4-1.1-4.4-4.8 0-1.1.4-1.9 1-2.6-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.3 9.3 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.5 1 2.6 0 3.7-2.2 4.5-4.4 4.8.4.4.7 1 .7 2v3c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.2z" />
    </svg>
  );
}

interface SizedIconProps extends IconProps {
  size?: number;
}

/** Groen vinkje: klaar om te mergen. */
export function CheckIcon({ className, size = SIZE }: SizedIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 12.5l4.8 4.8L19.5 7" />
    </svg>
  );
}

/** Rode driehoek: actie nodig (conflicten, gefaalde checks, changes requested). */
export function AlertIcon({ className, size = SIZE }: SizedIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4.2l8.8 15.6H3.2L12 4.2z" />
      <path d="M12 9.8v4.1" />
      <path d="M12 17.2h.01" />
    </svg>
  );
}

/** Omlijnd, stippellijn vierkant: concept-chip. */
export function ConceptIcon({ className, size = SIZE }: SizedIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="3.5"
        strokeDasharray="3.2 3.4"
      />
    </svg>
  );
}

/** Terminal-icoon voor agent-avatars. */
export function AgentIcon({ className, size = SIZE }: SizedIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.2" y="4.5" width="17.6" height="15" rx="3.2" />
      <path d="M7.6 10.2l2.6 2.3-2.6 2.3" />
      <path d="M13 14.8h3.6" />
    </svg>
  );
}

/** Reactiebubbel voor de commentaarteller. */
export function ReactieIcon({ className, size = SIZE }: SizedIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-6.6L6.5 19v-3.5a2 2 0 0 1-2-2v-7z" />
    </svg>
  );
}

/** Klok: geen checks ingesteld op deze PR. */
export function ClockIcon({ className, size = SIZE }: SizedIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.6V12l3 1.8" />
    </svg>
  );
}

/** Drie punten met vertakking: merge-knop. */
export function MergeIcon({ className, size = SIZE }: SizedIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6.5" cy="5.5" r="2.5" />
      <circle cx="6.5" cy="18.5" r="2.5" />
      <circle cx="17.5" cy="12" r="2.5" />
      <path d="M6.5 8v8" />
      <path d="M9 6.4c1.4 3.3 3.2 5.1 6 5.5" />
    </svg>
  );
}

/** Gevuld vierkant: stop-knop tijdens een agent-run. */
export function StopIcon({ className, size = SIZE }: SizedIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  );
}

/** Mapje: lokale projectmap koppelen. */
export function MapIcon({ className, size = SIZE }: SizedIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 7.2a2 2 0 0 1 2-2h3.2l2 2.2h7.8a2 2 0 0 1 2 2v7.4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.2z" />
    </svg>
  );
}

/** Oog: sectiekop "Jouw review nodig". */
export function EyeIcon({ className, size = SIZE }: SizedIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 12s3.4-6.5 9.5-6.5S21.5 12 21.5 12s-3.4 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

/** Inbox: sidebar-item "Alles". */
export function InboxIcon({ className, size = SIZE }: SizedIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.5h-5.5l-1.8 2.7h-3.4l-1.8-2.7H3" />
      <path d="M6 5.6 3 12.5v5.4a1.6 1.6 0 0 0 1.6 1.6h14.8a1.6 1.6 0 0 0 1.6-1.6v-5.4l-3-6.9A1.6 1.6 0 0 0 16.5 4.6h-9A1.6 1.6 0 0 0 6 5.6z" />
    </svg>
  );
}
