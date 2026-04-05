import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { Router } from "express";
import { auth } from "../auth.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export const authRoutes = Router();

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
