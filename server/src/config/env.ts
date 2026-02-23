import dotenv from "dotenv";

dotenv.config();

type NodeEnvironment = "development" | "test" | "production";

const normalizeNodeEnv = (value: string | undefined): NodeEnvironment => {
  if (value === "production" || value === "test") {
    return value;
  }
  return "development";
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
};

const parseBoolean = (value: string | undefined, fallback = false): boolean => {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
};

const parseCsv = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const nodeEnv = normalizeNodeEnv(process.env.NODE_ENV);
const isProduction = nodeEnv === "production";
const port = parsePositiveInt(process.env.PORT, 4000);
const jwtSecret = process.env.JWT_SECRET?.trim() ?? "";
const authSecret = process.env.AUTH_SECRET?.trim() || jwtSecret;
const requestTimeoutMs = parsePositiveInt(process.env.REQUEST_TIMEOUT_MS, 30_000);
const headersTimeoutMs = Math.max(
  parsePositiveInt(process.env.HEADERS_TIMEOUT_MS, 35_000),
  requestTimeoutMs + 1_000
);

export const env = {
  nodeEnv,
  isProduction,
  port,
  databaseUrl: process.env.DATABASE_URL?.trim() ?? "",
  jwtSecret: jwtSecret || "change-me",
  authSecret,
  authBaseUrl: process.env.AUTH_BASE_URL?.trim() ?? `http://localhost:${port}`,
  googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "",
  corsOrigins: parseCsv(process.env.CORS_ORIGINS),
  apiBodyLimit: process.env.API_BODY_LIMIT?.trim() || "1mb",
  trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
  requestTimeoutMs,
  headersTimeoutMs
};

if (env.isProduction) {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is required in production.");
  }
  if (!env.authBaseUrl || env.authBaseUrl.includes("localhost")) {
    throw new Error("AUTH_BASE_URL must be set to the public HTTPS API URL in production.");
  }
  if (!jwtSecret || jwtSecret === "change-me") {
    throw new Error("JWT_SECRET must be set to a strong value in production.");
  }
  if (!authSecret || authSecret === "change-me") {
    throw new Error("AUTH_SECRET must be set to a strong value in production.");
  }
  if (env.corsOrigins.length === 0) {
    throw new Error("CORS_ORIGINS must be set in production.");
  }
}
