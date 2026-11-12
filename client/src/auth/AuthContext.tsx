import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { clearRedirectPath, readRedirectPath } from "./redirect";
import { setOfflineAccount, subscribeToAccountChange } from "../offline/accountScope";
import { destroyAllYjsProviders } from "../collaboration/yjsProvider";

subscribeToAccountChange(() => {
  destroyAllYjsProviders();
  if (typeof caches !== "undefined") void caches.keys().then((keys) =>
    Promise.all(keys.filter((key) => key.startsWith("editor-api-")).map((key) => caches.delete(key)))
  );
});

export const DEFAULT_AUTH_REDIRECT_PATH = "/editor/recent?workspaceId=default";

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  image?: string;
}

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  getRedirectPath: (fallback?: string) => string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type SessionUserPayload = {
  id?: unknown;
  email?: unknown;
  name?: unknown;
  image?: unknown;
};

type SessionPayload = {
  session?: {
    userId?: unknown;
    user?: SessionUserPayload;
  };
  user?: SessionUserPayload;
  data?: {
    user?: SessionUserPayload;
    session?: {
      userId?: unknown;
      user?: SessionUserPayload;
    };
  };
};

const toOptionalString = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const parseSessionUser = (payload: unknown): AuthUser | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = payload as SessionPayload;
  const userData =
    data.user ??
    data.session?.user ??
    data.data?.user ??
    data.data?.session?.user ??
    null;

  const userId =
    toOptionalString(userData?.id) ??
    toOptionalString(data.session?.userId) ??
    toOptionalString(data.data?.session?.userId);

  if (!userId) {
    return null;
  }

  return {
    id: userId,
    email: toOptionalString(userData?.email),
    name: toOptionalString(userData?.name),
    image: toOptionalString(userData?.image)
  };
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const sequence = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const confirmedUserId = useRef<string | null>(null);
  const localLogout = useRef(false);
  const commitSession = useCallback((nextUser: AuthUser | null) => {
    const id = nextUser?.id ?? null;
    setOfflineAccount(id);
    setUser(nextUser);
    setStatus(nextUser ? "authenticated" : "unauthenticated");
    if (confirmedUserId.current !== id) channel.current?.postMessage("invalidate");
    confirmedUserId.current = id;
  }, []);

  const refresh = useCallback(async () => {
    localLogout.current = false;
    const attempt = ++sequence.current;
    setStatus((prev) => (prev === "authenticated" ? prev : "loading"));

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: "GET",
        credentials: "include"
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (attempt === sequence.current) commitSession(response.ok ? parseSessionUser(payload) : null);
    } catch {
      if (attempt === sequence.current) commitSession(null);
    }
  }, [commitSession]);

  const signOut = useCallback(async () => {
    sequence.current++;
    localLogout.current = true;
    setOfflineAccount(null);
    setUser(null);
    setStatus("unauthenticated");
    confirmedUserId.current = null;
    const response = await fetch(`${API_BASE_URL}/api/auth/logout`, { method: "POST", credentials: "include" });
    if (response.ok) channel.current?.postMessage("invalidate");
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("collabit-auth");
      channel.current.onmessage = () => {
        setOfflineAccount(null);
        setStatus("loading");
        void refresh();
      };
    }
    const revalidate = () => { if (!localLogout.current) void refresh(); };
    window.addEventListener("focus", revalidate);
    void refresh();
    return () => {
      channel.current?.close();
      window.removeEventListener("focus", revalidate);
    };
  }, [refresh]);

  const getRedirectPath = useCallback((fallback = DEFAULT_AUTH_REDIRECT_PATH) => {
    const stored = readRedirectPath();
    if (stored) {
      clearRedirectPath();
      return stored;
    }
    return fallback;
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      refresh,
      signOut,
      getRedirectPath
    }),
    [status, user, refresh, signOut, getRedirectPath]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
