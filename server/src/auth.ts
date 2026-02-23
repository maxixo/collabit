import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { env } from "./config/env.js";

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL is required for Better Auth");
}

const pool = new Pool({ connectionString: env.databaseUrl });
const authSecret = env.authSecret || undefined;
const googleConfig =
  env.googleClientId && env.googleClientSecret
    ? {
        google: {
          clientId: env.googleClientId,
          clientSecret: env.googleClientSecret
        }
      }
    : undefined;
const advancedConfig = env.isProduction
  ? undefined
  : {
      disableCSRFCheck: true,
      disableOriginCheck: true
    };

export const auth = betterAuth({
  database: pool,
  baseURL: env.authBaseUrl,
  secret: authSecret,
  emailAndPassword: {
    enabled: true
  },
  socialProviders: googleConfig,
  advanced: advancedConfig
});

export const runAuthMigrations = async () => {
  const ctx = await auth.$context;
  await ctx.runMigrations();
};
