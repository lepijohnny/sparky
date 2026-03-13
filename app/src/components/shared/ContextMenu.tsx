import { ChevronRight } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import styles from "./ContextMenu.module.css";

export interface ContextMenuAction {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  /** Renders in danger/red color */
  danger?: boolean;
  /** Dims the item and prevents interaction */
  disabled?: boolean;
  /** Trailing element (e.g. checkmark) */
  suffix?: ReactNode;
  /** Submenu items — renders a flyout on hover */
  submenu?: ContextMenuAction[];
}

interface ContextMenuProps {
  /** Clickable trigger element */
  children: ReactNode;
  actions: ContextMenuAction[];
  /** Menu alignment relative to trigger */
  align?: "left" | "right";
}

const MENU_WIDTH = 200;
const MENU_PADDING = 8;

/** Clamp a menu position so it stays within the viewport */
function clampToViewport(
  top: number,
  left: number,
  menuHeight: number,
  menuWidth = MENU_WIDTH,
): { top: number; left: number } {
  const maxLeft = window.innerWidth - menuWidth - MENU_PADDING;
  const maxTop = window.innerHeight - menuHeight - MENU_PADDING;
  return {
    top: Math.max(MENU_PADDING, Math.min(top, maxTop)),
    left: Math.max(MENU_PADDING, Math.min(left, maxLeft)),
  };
}

export default function ContextMenu({
  children,
  actions,
  align = "right",
}: ContextMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const calcPos = useCallback(() => {
    if (!triggerRef.current) return { top: 0, left: 0 };
    const rect = triggerRef.current.getBoundingClientRect();
    const rawTop = rect.bottom + 4;
    const rawLeft = align === "right" ? rect.right - MENU_WIDTH : rect.left;
    // Estimate menu height: items * ~32px + padding
    const estimatedHeight = actions.length * 32 + 16;
    return clampToViewport(rawTop, rawLeft, estimatedHeight);
  }, [align, actions.length]);

  // Reposition after mount when we know actual menu height
  useEffect(() => {
    if (!open || !menuRef.current || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const rawTop = rect.bottom + 4;
    const rawLeft = align === "right" ? rect.right - MENU_WIDTH : rect.left;
    const clamped = clampToViewport(rawTop, rawLeft, menuRect.height);
    if (clamped.top !== menuPos.top || clamped.left !== menuPos.left) {
      setMenuPos(clamped);
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      if (target.closest("[data-context-submenu]")) return;
      setOpen(false);
      setActiveSubmenu(null);
    };
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [open]);

  const handleAction = useCallback((action: ContextMenuAction) => {
    if (action.submenu) return;
    if (submenuTimer.current) clearTimeout(submenuTimer.current);
    setOpen(false);
    setActiveSubmenu(null);
    action.onClick?.();
  }, []);

  const handleToggle = useCallback(() => {
    if (!open) setMenuPos(calcPos());
    setOpen(!open);
    setActiveSubmenu(null);
  }, [open, calcPos]);

  return (
    <div className={styles.wrapper} ref={triggerRef}>
      <div className={styles.trigger} onClick={handleToggle} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
      {open && createPortal(
        <div
          ref={menuRef}
          className={styles.menu}
          style={{ top: menuPos.top, left: menuPos.left }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {actions.map((action) => (
            <MenuItem
              key={action.label}
              action={action}
              isSubOpen={activeSubmenu === action.label}
              onHover={(hasSubmenu) => {
                if (submenuTimer.current) clearTimeout(submenuTimer.current);
                if (hasSubmenu) {
                  submenuTimer.current = setTimeout(() => setActiveSubmenu(action.label), 100);
                } else {
                  setActiveSubmenu(null);
                }
              }}
              onAction={handleAction}
            />
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

function MenuItem({
  action,
  isSubOpen,
  onHover,
  onAction,
}: {
  action: ContextMenuAction;
  isSubOpen: boolean;
  onHover: (hasSubmenu: boolean) => void;
  onAction: (a: ContextMenuAction) => void;
}) {
  const itemRef = useRef<HTMLDivElement>(null);
  const [subPos, setSubPos] = useState<{ top: number; left: number } | null>(null);

  const calcSubPos = useCallback(() => {
    if (!itemRef.current || !action.submenu) return null;
    const rect = itemRef.current.getBoundingClientRect();
    const estimatedHeight = action.submenu.length * 32 + 16;
    const rawTop = rect.top;
    const rawLeft = rect.right + 2;
    return clampToViewport(rawTop, rawLeft, estimatedHeight);
  }, [action.submenu]);

  const handleHover = useCallback(() => {
    if (action.submenu) setSubPos(calcSubPos());
    onHover(!!action.submenu);
  }, [action.submenu, calcSubPos, onHover]);

  if (action.submenu) {
    return (
      <div
        ref={itemRef}
        className={`${styles.menuItem} ${isSubOpen ? styles.menuItemActive : ""}`}
        onMouseEnter={handleHover}
      >
        {action.icon}
        <span className={styles.menuItemLabel}>{action.label}</span>
        <ChevronRight size={10} strokeWidth={1.5} className={styles.submenuArrow} />
        {isSubOpen && subPos && createPortal(
          <div
            data-context-submenu
            className={styles.submenu}
            style={{ top: subPos.top, left: subPos.left }}
          >
            {action.submenu.map((sub) => (
              <button
                key={sub.label}
                className={`${styles.menuItem} ${sub.danger ? styles.menuItemDanger : ""}`}
                style={sub.disabled ? { opacity: 0.4, pointerEvents: "none" } : undefined}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => sub.onClick?.()}
                disabled={sub.disabled}
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

  return (
    <button
      className={`${styles.menuItem} ${action.danger ? styles.menuItemDanger : ""}`}
      onMouseEnter={() => onHover(false)}
      onClick={() => onAction(action)}
    >
      {action.icon}
      <span className={styles.menuItemLabel}>{action.label}</span>
      {action.suffix && <span className={styles.menuItemSuffix}>{action.suffix}</span>}
    </button>
  );
}
