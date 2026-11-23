const pending = new Map<string, Promise<unknown>>();
export const withDocumentLock = <T>(id: string, action: () => Promise<T>): Promise<T> => {
  const next = (pending.get(id) ?? Promise.resolve()).catch(() => {}).then(action);
  pending.set(id, next);
  const clear = () => { if (pending.get(id) === next) pending.delete(id); };
  void next.then(clear, clear);
  return next;
};
export const flushDocumentOperations = async () => {
  while (pending.size) {
    const results = await Promise.allSettled([...pending.values()]);
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
};
