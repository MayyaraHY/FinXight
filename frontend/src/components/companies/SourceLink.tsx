import { ReactNode } from "react";

/**
 * Wraps an operand/KPI label. When `href` is set, renders a link that opens the
 * source statement (bilan / compte de résultat) in a new tab with a small ↗
 * affordance; otherwise renders plain text (non-navigable operand).
 */
export default function SourceLink({
  href,
  children,
  className = "",
}: {
  href: string | null;
  children: ReactNode;
  className?: string;
}) {
  if (!href) return <span className={className}>{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Voir la source"
      className={`inline-flex items-center gap-0.5 hover:text-brand-500 dark:hover:text-brand-400 transition ${className}`}
    >
      {children}
      <svg
        className="w-2.5 h-2.5 flex-shrink-0 opacity-50"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M4.5 3H9v4.5M9 3L3 9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}
