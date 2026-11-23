type LogLevel = "debug" | "info" | "warn" | "error";

const levels: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const configuredLevel = process.env.LOG_LEVEL?.toLowerCase();
const minimumLevel: LogLevel = configuredLevel && configuredLevel in levels
  ? configuredLevel as LogLevel
  : process.env.NODE_ENV === "production" ? "info" : "debug";
const sensitiveKey = /(?:password|secret|token|authorization|cookie|credential|smtpuser|databaseurl|email|content|body|payload|sql|query)/i;

const redactString = (value: string): string => value
  .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
  .replace(/\b(password|secret|token|access_token|refresh_token|client_secret|api[_-]?key)=([^\s&;,]+)/gi, "$1=[REDACTED]")
  .replace(/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s/]+@/gi, "$1[REDACTED]@")
  .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]")
  .slice(0, 2_000);

export const sanitizeLogContext = (value: unknown, key = "", seen = new WeakSet<object>()): unknown => {
  if (sensitiveKey.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) return value;
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeLogContext(item, key, seen));
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      sanitizeLogContext(childValue, childKey, seen)
    ]));
  }
  return String(value);
};

const write = (level: LogLevel, message: string, context: unknown[]) => {
  if (levels[level] < levels[minimumLevel]) return;
  const record = {
    timestamp: new Date().toISOString(),
    level,
    message: redactString(message),
    ...(context.length ? { context: sanitizeLogContext(context.length === 1 ? context[0] : context) } : {})
  };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") console.debug(line);
  else console.info(line);
};

export const logger = {
  info: (message: string, ...meta: unknown[]) => write("info", message, meta),
  debug: (message: string, ...meta: unknown[]) => write("debug", message, meta),
  warn: (message: string, ...meta: unknown[]) => write("warn", message, meta),
  error: (message: string, ...meta: unknown[]) => write("error", message, meta)
};
