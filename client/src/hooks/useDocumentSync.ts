import { useEffect } from "react";
import { flushDocumentQueue } from "../offline/documentQueue";
import { syncOnReconnect } from "../offline/syncOnReconnect";
import { useAuth } from "../auth/AuthContext";

export const useDocumentSync = () => {
  const { user, status } = useAuth();
  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    const flushQueue = async () => {
      await flushDocumentQueue();
    };

    if (navigator.onLine) {
      void flushQueue().catch(() => undefined);
    }

    return syncOnReconnect({ flushQueue });
  }, [user?.id, status]);
};
