import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sbForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "budget_summary",
  title: "Budget summary (target vs actual)",
  description:
    "Returns target (from the active estimate version) vs actual (sum of invoices) per DIN 276 3-digit cost group. Amounts in EUR.",
  inputSchema: {
    version_id: z.string().uuid().optional().describe("Estimate version to use as target. Defaults to the active version."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ version_id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = sbForUser(ctx);

    let versionId = version_id;
    if (!versionId) {
      const { data: v } = await sb
        .from("estimate_versions")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      versionId = v?.id;
    }

    const targets: Record<string, number> = {};
    if (versionId) {
      const { data: blocks } = await sb.from("estimate_blocks").select("id").eq("version_id", versionId);
      const blockIds = (blocks ?? []).map((b) => b.id);
      if (blockIds.length) {
        const { data: items } = await sb
          .from("architect_estimate_items")
          .select("kostengruppe_code, estimated_amount")
          .in("block_id", blockIds);
        for (const it of items ?? []) {
          const key = (it.kostengruppe_code ?? "").substring(0, 3);
          targets[key] = (targets[key] ?? 0) + Number(it.estimated_amount ?? 0);
        }
      }
    }

    const actuals: Record<string, number> = {};
    const { data: invs } = await sb.from("invoices").select("amount, kostengruppe_code");
    for (const inv of invs ?? []) {
      const key = (inv.kostengruppe_code ?? "").substring(0, 3) || "uncategorized";
      actuals[key] = (actuals[key] ?? 0) + Number(inv.amount ?? 0);
    }

    const keys = Array.from(new Set([...Object.keys(targets), ...Object.keys(actuals)])).sort();
    const rows = keys.map((k) => ({
      kostengruppe: k,
      target_eur: Math.round((targets[k] ?? 0) * 100) / 100,
      actual_eur: Math.round((actuals[k] ?? 0) * 100) / 100,
      delta_eur: Math.round(((actuals[k] ?? 0) - (targets[k] ?? 0)) * 100) / 100,
    }));
    const totals = rows.reduce(
      (a, r) => ({ target: a.target + r.target_eur, actual: a.actual + r.actual_eur }),
      { target: 0, actual: 0 },
    );

    return {
      content: [{ type: "text", text: JSON.stringify({ version_id: versionId, rows, totals }, null, 2) }],
      structuredContent: { version_id: versionId, rows, totals },
    };
  },
});
