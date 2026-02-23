import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

type HttpError = Error & {
  status?: number;
  statusCode?: number;
  code?: string;
};

export const errorMiddleware = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const httpError = err as HttpError;
  const statusCode = httpError.statusCode ?? httpError.status ?? 500;
  const message =
    statusCode >= 500 && env.isProduction
      ? "Internal server error"
      : httpError.message || "Unexpected error";

  logger.error(`Request failed with status ${statusCode}`, {
    message: httpError.message,
    code: httpError.code
  });

  res.status(statusCode).json({
    message,
    code: statusCode >= 500 ? "INTERNAL_ERROR" : httpError.code
  });
};
