import { z } from 'zod'
export const loginSchema = z.object({
  credentials: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(1024),
})
export const shareSchema = z.object({
  token: z.string().min(1).max(2048),
  id: z.coerce.number().int().positive(),
  password: z.string().max(1024).default(''),
})
