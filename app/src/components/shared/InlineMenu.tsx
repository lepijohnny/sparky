import { ChevronRight } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ContextMenuAction } from "./ContextMenu";
import styles from "./ContextMenu.module.css";

interface InlineMenuProps {
  actions: ContextMenuAction[];
}

/**
 * Renders context menu actions as a static inline card
 * (same visual style as the dropdown ContextMenu).
 * Submenus fly out to the right, same as ContextMenu.
 */
export default function InlineMenu({ actions }: InlineMenuProps) {
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  return (
    <div className={styles.menu} style={{ position: "relative" }}>
      {actions.map((action) => {
        if (action.submenu) {
          return (
            <SubmenuItem
              key={action.label}
              action={action}
              isOpen={openSubmenu === action.label}
              onHover={(label) => setOpenSubmenu(label)}
              onLeave={() => setOpenSubmenu(null)}
            />
          );
        }

        return (
          <button
            key={action.label}
            className={`${styles.menuItem} ${action.danger ? styles.menuItemDanger : ""}`}
            onClick={() => action.onClick?.()}
            disabled={action.disabled}
            style={action.disabled ? { opacity: 0.4, pointerEvents: "none" } : undefined}
          >
            {action.icon}
            <span className={styles.menuItemLabel}>{action.label}</span>
            {action.suffix && <span className={styles.menuItemSuffix}>{action.suffix}</span>}
          </button>
        );
      })}
    </div>
  );
}

function SubmenuItem({
  action,
  isOpen,
  onHover,
  onLeave,
}: {
  action: ContextMenuAction;
  isOpen: boolean;
  onHover: (label: string) => void;
  onLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [subPos, setSubPos] = useState<{ top: number; left: number } | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setSubPos({ top: rect.top, left: rect.right + 2 });
    }
    onHover(action.label);
  }, [onHover, action.label]);

  return (
    <div
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onLeave}
    >
      <div
        className={`${styles.menuItem} ${isOpen ? styles.menuItemActive : ""}`}
        style={action.disabled ? { opacity: 0.4, pointerEvents: "none" } : undefined}
      >
        {action.icon}
        <span className={styles.menuItemLabel}>{action.label}</span>
        <ChevronRight size={10} strokeWidth={1.5} className={styles.submenuArrow} />
      </div>
      {isOpen && subPos && action.submenu && createPortal(
        <div
          className={styles.submenu}
          style={{ top: subPos.top, left: subPos.left }}
          onMouseEnter={() => onHover(action.label)}
          onMouseLeave={onLeave}
        >
          {action.submenu.map((sub) => (
            <button
              key={sub.label}
              className={`${styles.menuItem} ${sub.danger ? styles.menuItemDanger : ""}`}
              onClick={() => sub.onClick?.()}
              disabled={sub.disabled}
              style={sub.disabled ? { opacity: 0.4, pointerEvents: "none" as const } : undefined}
            >
              {sub.icon}
              <span className={styles.menuItemLabel}>{sub.label}</span>
              {sub.suffix && <span className={styles.menuItemSuffix}>{sub.suffix}</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
