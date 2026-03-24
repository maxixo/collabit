import { useEffect } from "react";
import { flushDocumentQueue } from "../offline/documentQueue";
import { syncOnReconnect } from "../offline/syncOnReconnect";

export const useDocumentSync = () => {
  useEffect(() => {
    const flushQueue = async () => {
      await flushDocumentQueue();
    };

    if (navigator.onLine) {
      void flushQueue().catch(() => undefined);
    }

    return syncOnReconnect({ flushQueue });
  }, []);
};
