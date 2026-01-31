import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { Router } from "express";
import { auth } from "../auth.js";
import { env } from "../config/env.js";

export const authRoutes = Router();

const buildAuthRequest = (
  req: ExpressRequest,
  path: string,
  body?: Record<string, unknown>
) => {
  const baseUrl = env.authBaseUrl || `${req.protocol}://${req.get("host")}`;
  const url = new URL(`/api/auth/${path}`, baseUrl);
  const headers = new Headers();

  headers.set("content-type", "application/json");

  const forwardedHeaders = ["cookie", "user-agent", "x-forwarded-for", "x-forwarded-proto"];
  forwardedHeaders.forEach((headerName) => {
    const value = req.header(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  });

  return new Request(url.toString(), {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
};

const sendAuthResponse = async (res: ExpressResponse, response: Response) => {
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      res.append("set-cookie", value);
    } else {
      res.setHeader(key, value);
    }
  });

  res.status(response.status);
  const text = await response.text();
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

    const authRequest = buildAuthRequest(req, "sign-in/social", {
      provider,
      callbackURL,
      disableRedirect
    });
    const response = await auth.handler(authRequest);
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
    const baseUrl = env.authBaseUrl || `${req.protocol}://${req.get("host")}`;
    const fullUrl = new URL(req.originalUrl, baseUrl);
    const headers = new Headers();
    const cookieHeader = req.header("cookie");
    if (cookieHeader) {
      headers.set("cookie", cookieHeader);
    }

    const response = await auth.handler(
      new Request(fullUrl.toString(), {
        method: "GET",
        headers
      })
    );

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
