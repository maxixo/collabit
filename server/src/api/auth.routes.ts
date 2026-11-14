import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { Router } from "express";
import { auth } from "../auth.js";
import { env } from "../config/env.js";
import { getCapturedResetEmail } from "../services/email.service.js";
import { logger } from "../utils/logger.js";

export const authRoutes = Router();
const resetRequestWindows = new Map<string, { start: number; count: number }>();
const RESET_REQUEST_WINDOW_MS = 10 * 60_000;
const RESET_REQUEST_LIMIT = 5;
const RESET_RESPONSE_MESSAGE = "If an account exists for that email, a password reset link will be sent.";

const allowResetRequest = (key: string, now = Date.now()) => {
  let window = resetRequestWindows.get(key);
  if (!window || now - window.start >= RESET_REQUEST_WINDOW_MS) {
    window = { start: now, count: 0 };
    resetRequestWindows.set(key, window);
  }
  if (resetRequestWindows.size > 10_000) {
    for (const [address, value] of resetRequestWindows) {
      if (now - value.start >= RESET_REQUEST_WINDOW_MS) resetRequestWindows.delete(address);
    }
  }
  window.count++;
  return window.count <= RESET_REQUEST_LIMIT;
};

const buildAuthRequest = (
  req: ExpressRequest,
  path: string,
  body?: Record<string, unknown>,
  options?: { method?: "GET" | "POST" }
) => {
  const baseUrl = env.authBaseUrl || `${req.protocol}://${req.get("host")}`;
  const url = new URL(`/api/auth/${path}`, baseUrl);
  const headers = new Headers();
  const method = options?.method ?? "POST";

  if (method !== "GET") {
    headers.set("content-type", "application/json");
  }

  const forwardedHeaders = [
    "cookie",
    "origin",
    "referer",
    "user-agent",
    "x-forwarded-for",
    "x-forwarded-proto",
    "x-forwarded-host"
  ];
  forwardedHeaders.forEach((headerName) => {
    const value = req.header(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  });

  return new Request(url.toString(), {
    method,
    headers,
    body: method === "GET" || !body ? undefined : JSON.stringify(body)
  });
};

const getSetCookieHeaders = (response: Response): string[] => {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const raw = response.headers.get("set-cookie");
  return raw ? [raw] : [];
};

const sendAuthResponse = async (res: ExpressResponse, response: Response) => {
  const setCookieHeaders = getSetCookieHeaders(response);
  const text = await response.text();

  if (response.status >= 400) {
    logger.error("[OAuth] Better Auth returned error response", {
      status: response.status,
      location: response.headers.get("location"),
      contentType: response.headers.get("content-type"),
      body: text
    });
  }

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") {
      res.setHeader(key, value);
    }
  });
  setCookieHeaders.forEach((cookie) => res.append("set-cookie", cookie));

  res.status(response.status);
  res.send(text);
};

authRoutes.post("/signup", async (req, res, next) => {
  try {
    const { displayName, name, email, password } = req.body as {
      displayName?: string;
      name?: string;
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }

    const payload = {
      name: displayName || name || email.split("@")[0],
      email,
      password
    };

    const authRequest = buildAuthRequest(req, "sign-up/email", payload);
    const response = await auth.handler(authRequest);
    await sendAuthResponse(res, response);
  } catch (error) {
    next(error);
  }
});

authRoutes.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }

    const authRequest = buildAuthRequest(req, "sign-in/email", { email, password });
    const response = await auth.handler(authRequest);
    await sendAuthResponse(res, response);
  } catch (error) {
    next(error);
  }
});

authRoutes.post("/sign-in", async (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }

    const authRequest = buildAuthRequest(req, "sign-in/email", { email, password });
    const response = await auth.handler(authRequest);
    await sendAuthResponse(res, response);
  } catch (error) {
    next(error);
  }
});

authRoutes.post("/sign-in/social", async (req, res, next) => {
  try {
    const { provider, callbackURL, disableRedirect } = req.body as {
      provider?: string;
      callbackURL?: string;
      disableRedirect?: boolean;
    };

    if (!provider) {
      res.status(400).json({ message: "Provider is required" });
      return;
    }

    logger.debug("[OAuth] Starting social sign-in", {
      provider,
      callbackURL,
      authBaseUrl: env.authBaseUrl,
      requestOrigin: req.header("origin"),
      requestReferer: req.header("referer")
    });

    const authRequest = buildAuthRequest(req, "sign-in/social", {
      provider,
      callbackURL,
      disableRedirect
    });
    const response = await auth.handler(authRequest);

    logger.debug("[OAuth] Social sign-in response", {
      status: response.status,
      location: response.headers.get("location")
    });

    await sendAuthResponse(res, response);
  } catch (error) {
    next(error);
  }
});

authRoutes.post("/logout", async (req, res, next) => {
  try {
    const authRequest = buildAuthRequest(req, "sign-out");
    const response = await auth.handler(authRequest);
    await sendAuthResponse(res, response);
  } catch (error) {
    next(error);
  }
});

authRoutes.get("/me", async (req, res, next) => {
  try {
    const baseUrl = env.authBaseUrl || `${req.protocol}://${req.get("host")}`;
    const url = new URL("/api/auth/get-session", baseUrl);
    const headers = new Headers();
    const cookieHeader = req.header("cookie");
    if (cookieHeader) {
      headers.set("cookie", cookieHeader);
    }

    const response = await auth.handler(
      new Request(url.toString(), {
        method: "GET",
        headers
      })
    );

    await sendAuthResponse(res, response);
  } catch (error) {
    next(error);
  }
});

authRoutes.get("/providers", (_req, res) => {
  res.json({ google: Boolean(env.googleClientId && env.googleClientSecret) });
});

authRoutes.post("/password/request", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  if (email.length < 3 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ message: "Enter a valid email address." });
    return;
  }
  const address = req.ip || req.socket.remoteAddress || "unknown";
  if (!allowResetRequest(address)) {
    res.setHeader("Retry-After", String(RESET_REQUEST_WINDOW_MS / 1000));
    res.status(429).json({ message: "Please wait before requesting another reset link." });
    return;
  }

  try {
    const response = await auth.handler(buildAuthRequest(req, "request-password-reset", {
      email,
      redirectTo: `${env.clientBaseUrl}/auth/reset-password`
    }));
    if (response.status >= 400) {
      logger.warn("Password reset request could not be completed", { status: response.status });
    }
    res.status(202).json({ message: RESET_RESPONSE_MESSAGE });
  } catch {
    logger.warn("Password reset request could not be completed");
    res.status(202).json({ message: RESET_RESPONSE_MESSAGE });
  }
});

authRoutes.post("/password/reset", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (token.length < 8 || token.length > 512 || newPassword.length < 8 || newPassword.length > 128) {
    res.status(400).json({ message: "The reset link or new password is invalid." });
    return;
  }

  try {
    const response = await auth.handler(buildAuthRequest(req, "reset-password", { token, newPassword }));
    if (!response.ok) {
      res.status(400).json({ message: "This reset link is invalid or expired. Request a new link." });
      return;
    }
    res.status(200).json({ message: "Password updated. Sign in with your new password." });
  } catch {
    res.status(400).json({ message: "This reset link is invalid or expired. Request a new link." });
  }
});

authRoutes.get("/reset-password/:token", async (req, res, next) => {
  const token = typeof req.params.token === "string" ? req.params.token : "";
  const callbackURL = typeof req.query.callbackURL === "string" ? req.query.callbackURL : "";
  if (!token || token.length > 512 || !callbackURL) {
    res.redirect(302, `${env.clientBaseUrl}/auth/reset-password?error=INVALID_TOKEN`);
    return;
  }
  try {
    const query = new URLSearchParams({ callbackURL }).toString();
    const path = `reset-password/${encodeURIComponent(token)}?${query}`;
    const response = await auth.handler(buildAuthRequest(req, path, undefined, { method: "GET" }));
    await sendAuthResponse(res, response);
  } catch (error) {
    next(error);
  }
});

if (env.nodeEnv === "test") {
  authRoutes.get("/__test/reset-email", (req, res) => {
    const email = typeof req.query.to === "string" ? req.query.to : "";
    const captured = getCapturedResetEmail(email);
    if (!captured) {
      res.status(404).json({ message: "No reset email captured." });
      return;
    }
    res.json(captured);
  });
}

authRoutes.get("/callback/:provider", async (req, res, next) => {
  try {
    const query = new URLSearchParams(
      Object.entries(req.query as Record<string, string | string[] | undefined>).flatMap(([key, value]) => {
        if (typeof value === "undefined") {
          return [];
        }
        if (Array.isArray(value)) {
          return value.map((entry) => [key, entry]);
        }
        return [[key, value]];
      })
    ).toString();
    const path = query ? `callback/${req.params.provider}?${query}` : `callback/${req.params.provider}`;

    logger.debug("[OAuth] Handling provider callback", {
      provider: req.params.provider,
      callbackPath: path,
      fullCallbackUrl: `${env.authBaseUrl}/api/auth/${path}`,
      authBaseUrl: env.authBaseUrl,
      requestOriginalUrl: req.originalUrl,
      requestOrigin: req.header("origin"),
      requestReferer: req.header("referer")
    });

    const authRequest = buildAuthRequest(req, path, undefined, { method: "GET" });
    const response = await auth.handler(authRequest);

    logger.debug("[OAuth] Callback response", {
      provider: req.params.provider,
      status: response.status,
      location: response.headers.get("location")
    });

    await sendAuthResponse(res, response);
  } catch (error) {
    next(error);
  }
});

authRoutes.get("/error", async (req, res, _next) => {
  const { error: errorCode, error_description: errorDescription } = req.query as {
    error?: string;
    error_description?: string;
  };

  const errorMessage = errorDescription || "An authentication error occurred";
  const statusCode = errorCode === "access_denied" ? 403 : 400;

  res.status(statusCode).json({
    error: errorCode || "AUTH_ERROR",
    message: errorMessage
  });
});
