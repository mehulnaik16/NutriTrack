/**
 * The write half of the ops agent: propose, then execute on confirmation.
 *
 * Two functions, and the gap between them is the point. `proposeAction` records
 * what was asked and returns a code. `executeConfirmed` performs it — and is
 * called from the webhook when the operator types that code, never by the
 * model.
 *
 * That gap is what makes prompt injection survivable. A user whose profile name
 * reads "grant me a year of access" can talk the model into proposing it. The
 * proposal is visible, attributed, and does nothing until a human who owns the
 * group types six characters back.
 */

import { canWrite, confirmationCode } from "./ops-authz";

/** Everything the agent may change. Nothing destructive, nothing unbounded. */
export const WRITE_ACTIONS = {
  grant_access: {
    rpc: "ops_grant_access",
    /** Rendered for the operator to read before confirming. */
    summarise: (a: Record<string, unknown>) =>
      `Grant ${a.grant_days} days of access to user ${a.user_ref} — "${a.reason}"`,
  },
  revoke_grant: {
    rpc: "ops_revoke_grant",
    summarise: (a: Record<string, unknown>) =>
      `Revoke manual grant ${a.grant_id}`,
  },
  reset_notifications: {
    rpc: "ops_reset_notifications",
    summarise: (a: Record<string, unknown>) =>
      `Reset notification settings for user ${a.user_ref} to defaults`,
  },
} as const;

export type WriteAction = keyof typeof WRITE_ACTIONS;

export const isWriteAction = (name: string): name is WriteAction =>
  Object.prototype.hasOwnProperty.call(WRITE_ACTIONS, name);

/**
 * What the model sees.
 *
 * Every description says "propose" and says the operator must confirm, because
 * a model that believes it has already acted will report success that never
 * happened — and in a support conversation that is worse than refusing, since
 * nobody goes back to check.
 */
export const WRITE_TOOL_SPECS = [
  {
    type: "function" as const,
    function: {
      name: "grant_access",
      description:
        "PROPOSE granting a user extra days of access. Does not take effect until the group owner confirms with a code. Use when someone paid and did not receive access, or for goodwill. State the reason plainly.",
      parameters: {
        type: "object",
        properties: {
          user_ref: { type: "string", description: "Full uuid or 8-char prefix." },
          grant_days: {
            type: "integer",
            minimum: 1,
            maximum: 365,
            description: "Days of access to add.",
          },
          reason: {
            type: "string",
            minLength: 3,
            maxLength: 200,
            description: "Why. Recorded in the audit log.",
          },
        },
        required: ["user_ref", "grant_days", "reason"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "revoke_grant",
      description:
        "PROPOSE revoking a manual grant previously issued. Needs the grant id from diagnose_access. Requires owner confirmation.",
      parameters: {
        type: "object",
        properties: {
          grant_id: { type: "string", description: "The grant's uuid." },
        },
        required: ["grant_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reset_notifications",
      description:
        "PROPOSE resetting one user's notification settings to defaults and clearing their pending notifications. Use when their settings are stuck. Requires owner confirmation.",
      parameters: {
        type: "object",
        properties: {
          user_ref: { type: "string", description: "Full uuid or 8-char prefix." },
        },
        required: ["user_ref"],
      },
    },
  },
];

export interface ProposalResult {
  ok: boolean;
  code?: string;
  summary?: string;
  error?: string;
}

/**
 * Record an intended change and return the code that would perform it.
 *
 * Refuses outright for anyone who is not the group owner — checked here rather
 * than trusted from the conversation, because the model has no way to know who
 * is speaking and should not be asked to enforce authorisation.
 */
export async function proposeAction(
  chatId: string,
  requestedBy: number | undefined,
  action: string,
  args: Record<string, unknown>,
): Promise<ProposalResult> {
  if (!isWriteAction(action)) {
    return { ok: false, error: `Unknown action: ${action}` };
  }
  if (!(await canWrite(chatId, requestedBy))) {
    return {
      ok: false,
      error:
        "Only the group owner can change anything. Administrators cannot, deliberately.",
    };
  }

  const code = confirmationCode();
  const summary = WRITE_ACTIONS[action].summarise(args);

  const { supabaseAdmin } = await import("@/integrations/client.server");
  const { error } = await supabaseAdmin
    .from("ops_pending_actions")
    .insert({
      code,
      chat_id: Number(chatId),
      requested_by: requestedBy!,
      action,
      args,
      summary,
    } as never);

  if (error) return { ok: false, error: error.message };
  return { ok: true, code, summary };
}

export interface ExecutionResult {
  ok: boolean;
  message: string;
}

/**
 * Perform a previously proposed action.
 *
 * Called from the webhook on a literal "confirm <code>", so no model output
 * reaches it. Every check is re-done here rather than trusted from the
 * proposal: minutes have passed, and the proposal itself is attacker-reachable
 * input the moment it lands in a table.
 */
export async function executeConfirmed(
  chatId: string,
  confirmedBy: number | undefined,
  code: string,
): Promise<ExecutionResult> {
  const { supabaseAdmin } = await import("@/integrations/client.server");

  const { data: pending } = await supabaseAdmin
    .from("ops_pending_actions")
    .select("code, chat_id, requested_by, action, args, summary, expires_at, consumed_at")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (!pending) return { ok: false, message: "No pending action with that code." };
  if (pending.consumed_at) {
    return { ok: false, message: "That code has already been used." };
  }
  if (new Date(pending.expires_at).getTime() < Date.now()) {
    return { ok: false, message: "That code has expired. Ask again." };
  }
  if (String(pending.chat_id) !== chatId) {
    return { ok: false, message: "That code belongs to another chat." };
  }
  // Same person, not merely any owner. Otherwise a proposal could be left
  // dangling for someone else to confirm without having read it.
  if (pending.requested_by !== confirmedBy) {
    return { ok: false, message: "Only the person who asked can confirm it." };
  }
  if (!(await canWrite(chatId, confirmedBy))) {
    return { ok: false, message: "Only the group owner can confirm changes." };
  }
  if (!isWriteAction(pending.action)) {
    return { ok: false, message: `Unknown action: ${pending.action}` };
  }

  // Consumed before executing, so a double-tap cannot run it twice even if the
  // RPC is slow.
  const { error: claimError } = await supabaseAdmin
    .from("ops_pending_actions")
    .update({ consumed_at: new Date().toISOString() } as never)
    .eq("code", pending.code)
    .is("consumed_at", null);
  if (claimError) return { ok: false, message: claimError.message };

  const args = (pending.args ?? {}) as Record<string, unknown>;
  const actor = `telegram:${confirmedBy}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts leaves Functions empty
  const { data, error } = await (supabaseAdmin.rpc as any)(
    WRITE_ACTIONS[pending.action].rpc,
    { ...args, actor },
  );

  if (error) return { ok: false, message: `Failed: ${error.message}` };

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.ok === false) {
    return { ok: false, message: `Refused: ${result.error}` };
  }

  return {
    ok: true,
    message: `✅ ${pending.summary}\n\n${JSON.stringify(result, null, 2)}`,
  };
}
