import { z } from "zod"

export const SidepanelTabStateSchema = z.enum([
  "blocked",
  "approval-required",
  "approved",
])

export const SidepanelTabSchema = z.object({
  id: z.number().int().nonnegative(),
  title: z.string(),
  url: z.string(),
  origin: z.string().nullable(),
  state: SidepanelTabStateSchema,
})

export const SidepanelStatusSchema = z.object({
  bridgeConnected: z.boolean(),
  configReady: z.boolean(),
  currentBrief: z.string().max(2_000),
  tab: SidepanelTabSchema.nullable(),
})

export const SidepanelRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sidepanel.status") }),
  z.object({
    type: z.literal("sidepanel.tab.approve"),
    tabId: z.number().int().nonnegative(),
    origin: z.url(),
  }),
  z.object({ type: z.literal("sidepanel.dashboard.open") }),
  z.object({ type: z.literal("sidepanel.options.open") }),
  z.object({
    type: z.literal("sidepanel.brief.save"),
    brief: z.string().trim().min(1).max(2_000),
  }),
])

export const SidepanelResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), status: SidepanelStatusSchema }),
  z.object({ ok: z.literal(false), error: z.string() }),
])

export type SidepanelRequest = z.infer<typeof SidepanelRequestSchema>
export type SidepanelResponse = z.infer<typeof SidepanelResponseSchema>
export type SidepanelStatus = z.infer<typeof SidepanelStatusSchema>
export type SidepanelTabState = z.infer<typeof SidepanelTabStateSchema>
