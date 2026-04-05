import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { logout } from "../services/auth.service";

const avatarBaseClass =
  "flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#e7e7f3] text-sm font-bold text-[#4c4d9a] dark:border-[#2a2b4a] dark:bg-[#1e1f3a] dark:text-[#a1a1c9]";

type UserMenuProps = {
  onToggle?: (isOpen: boolean) => void;
};

export const UserMenu = ({ onToggle }: UserMenuProps) => {
  const { user, status, refresh } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    onToggle?.(isOpen);
  }, [isOpen, onToggle]);

  const userLabel = useMemo(() => {
    if (status !== "authenticated") {
      return "User";
    }
    return user?.name?.trim() || user?.email?.trim() || "User";
  }, [status, user]);

  const userInitial = useMemo(() => {
    const firstWord = userLabel.split(/\s+/)[0];
    return firstWord ? firstWord.charAt(0).toUpperCase() : "U";
  }, [userLabel]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current) {
        return;
      }
      if (!menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }
    setIsLoggingOut(true);
    setIsOpen(false);

    try {
      await logout();
    } catch {
      // Continue with local cleanup even if the request fails.
    }

    try {
      await refresh();
    } catch {
      // Ignore refresh failures on logout.
    }

    setIsLoggingOut(false);
    navigate("/auth/sign-in", { replace: true, state: { from: location } });
  };

  const menuItemClass =
    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#0d0e1b] transition-colors hover:bg-[#f0f0f7] dark:text-white dark:hover:bg-white/5";

  return (
    <div className="relative" ref={menuRef}>
      <button
        className={avatarBaseClass}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Open user menu"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        {user?.image ? (
          <img className="h-full w-full object-cover" src={user.image} alt={`${userLabel} profile`} />
        ) : (
          <span aria-hidden="true">{userInitial}</span>
        )}
      </button>

      {isOpen ? (
        <div
          className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-[#e7e7f3] bg-white p-2 shadow-xl dark:border-[#2a2b4a] dark:bg-[#16172d]"
          role="menu"
        >
          <div className="px-3 py-2">
            <p className="text-xs font-semibold text-[#4c4d9a] dark:text-[#a1a1c9]">Signed in as</p>
            <p className="truncate text-sm font-bold text-[#0d0e1b] dark:text-white">{userLabel}</p>
          </div>
          <div className="my-1 h-px bg-[#e7e7f3] dark:bg-[#2a2b4a]" />
          <Link
            className={menuItemClass}
            to="/profile"
            role="menuitem"
            onClick={() => setIsOpen(false)}
          >
            <span className="material-symbols-outlined text-lg">person</span>
            Profile
          </Link>
          <button
            className={`${menuItemClass} text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10`}
            type="button"
            role="menuitem"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            {isLoggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
      ) : null}
    </div>
  );
};
