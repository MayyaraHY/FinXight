"use client";

type Props = {
  onHide: () => void;
  onIgnore: () => void;
  className?: string;
};

/**
 * Two compact buttons for dismissing a warning. Inherits the surrounding text
 * colour (via `border-current`) so it blends into warning/error blocks alike.
 *
 * - "Masquer" hides the warning for the current session (reappears on reload).
 * - "Ignorer" dismisses it permanently (remembered in this browser).
 */
export default function DismissControls({ onHide, onIgnore, className }: Props) {
  const btn =
    "text-[11px] leading-none px-2 py-1 rounded border border-current opacity-60 hover:opacity-100 transition-opacity";
  return (
    <div className={`flex items-center gap-1.5 flex-shrink-0 ${className ?? ""}`}>
      <button
        type="button"
        onClick={onHide}
        title="Masquer — réapparaît au rechargement"
        className={btn}
      >
        Masquer
      </button>
      <button
        type="button"
        onClick={onIgnore}
        title="Ignorer — ne plus afficher (mémorisé dans ce navigateur)"
        className={btn}
      >
        Ignorer
      </button>
    </div>
  );
}
