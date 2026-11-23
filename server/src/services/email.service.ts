import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export type CapturedResetEmail = { to: string; url: string };

const resetEmails: CapturedResetEmail[] = [];
let transport: ReturnType<typeof nodemailer.createTransport> | undefined;

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

export const sendPasswordResetEmail = async (to: string, url: string) => {
  if (env.nodeEnv === "test") {
    resetEmails.push({ to, url });
    return;
  }

  if (!env.smtpHost || !env.smtpFrom || Boolean(env.smtpUser) !== Boolean(env.smtpPassword)) {
    throw new Error("Password reset email delivery is not configured.");
  }

  transport ??= nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    ...(env.smtpUser ? { auth: { user: env.smtpUser, pass: env.smtpPassword } } : {})
  });

  await transport.sendMail({
    from: env.smtpFrom,
    to,
    subject: "Reset your Collabit password",
    text: `Use this one-time link to reset your Collabit password. It expires in one hour.\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Use this one-time link to reset your Collabit password. It expires in one hour.</p><p><a href="${escapeHtml(url)}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`
  });
};

export const getCapturedResetEmail = (to: string) =>
  [...resetEmails].reverse().find((email) => email.to === to) ?? null;
