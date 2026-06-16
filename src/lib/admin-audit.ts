import { createAdminClient, type Actor } from "./admin";

/**
 * Append-only audit log for admin/assistant actions. Every mutation performed
 * through an admin route should call this so that, with multiple assistants
 * acting, there is an accountable record of who did what. Best-effort: failures
 * are logged but never block the action.
 */

type AuditInsertClient = {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => Promise<{ error: unknown }>;
  };
};

export async function logAdminAction(params: {
  actor: Pick<Actor, "userId" | "email" | "role"> | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const supabase = createAdminClient() as unknown as AuditInsertClient | null;
    if (!supabase) return;
    const { error } = await supabase.from("admin_audit_log").insert({
      actor_user_id: params.actor?.userId ?? null,
      actor_email: params.actor?.email ?? null,
      actor_role: params.actor?.role ?? null,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      details: params.details ?? null,
    });
    if (error) {
      console.error("logAdminAction: insert failed", error, { action: params.action });
    }
  } catch (error) {
    console.error("logAdminAction threw", error, { action: params.action });
  }
}
