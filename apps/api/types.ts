import type { Context } from "hono";
export interface Bindings extends Omit<
  Cloudflare.Env,
  "ENVIRONMENT" | "APP_ORIGIN" | "REGISTRATION_OPEN"
> {
  ENVIRONMENT: string;
  APP_ORIGIN: string;
  REGISTRATION_OPEN: string;
  TELEGRAM_CLIENT_ID?: string;
  TELEGRAM_CLIENT_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  PASSWORD_PEPPER?: string;
  RESEND_API_KEY?: string;
  BREVO_API_KEY?: string;
  EMAIL_FROM?: string;
  MFA_ENCRYPTION_KEY?: string;
  BACKUP_ENCRYPTION_KEY?: string;
  BILLING_WEBHOOK_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BOT_WEBHOOK_SECRET?: string;
}
export type Principal = {
  userId: string;
  tenantId: string | null;
  scope: "teacher" | "owner";
  sessionHash: string;
  csrfHash: string;
  name: string;
  email: string | null;
  membershipRole?: string;
};
export type AppEnv = {
  Bindings: Bindings;
  Variables: { principal: Principal; requestId: string };
};
export type Ctx = Context<AppEnv>;
export type Row = Record<string, any>;
