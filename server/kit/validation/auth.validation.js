import { z } from 'zod';
import { normalizeInstitutionEmail, ALLOWED_DOMAIN } from '../config/domain.js';

export const institutionEmail = z
  .string()
  .trim()
  .max(254)
  .transform((v) => normalizeInstitutionEmail(v))
  .refine((v) => v !== null, { message: `Use your @${ALLOWED_DOMAIN} email address.` })
  .transform((v) => /** @type {string} */ (v));

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[A-Za-z0-9_]+$/, 'Username can only contain alphanumeric characters and underscores'),
  email: institutionEmail,
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  turnstileToken: z.string().min(1, 'Turnstile verification token required')
});

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Username or email is required').optional(),
  email: z.string().min(1).optional(),
  password: z.string().min(1, 'Password is required'),
  turnstileToken: z.string().min(1, 'Turnstile verification token required')
});

export const resendVerificationSchema = z.object({
  email: institutionEmail,
  turnstileToken: z.string().min(1, 'Turnstile verification token required')
});

export const forgotPasswordSchema = z.object({
  email: institutionEmail,
  turnstileToken: z.string().min(1, 'Turnstile verification token required')
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100)
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(100)
});
