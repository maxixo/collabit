export const debounce = <Args extends unknown[]>(
  fn: (...args: Args) => void | Promise<void>,
  delayMs: number
) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const debounced = (...args: Args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => void fn(...args), delayMs);
  };

  debounced.cancel = () => {
    clearTimeout(timeoutId);
  };

  return debounced;
};
