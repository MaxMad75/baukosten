import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function sbForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_estimate_versions",
  title: "List estimate versions",
  description: "Lists all cost-estimate versions (V1, V2, ...) in the household with their blocks.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = sbForUser(ctx);
    const { data: versions, error: vErr } = await sb
      .from("estimate_versions")
      .select("id, name, version_number, is_active, created_at, notes")
      .order("version_number", { ascending: true });
    if (vErr) return { content: [{ type: "text", text: vErr.message }], isError: true };
    const { data: blocks, error: bErr } = await sb
      .from("estimate_blocks")
      .select("id, version_id, label, block_type, carry_forward, sort_order, processed");
    if (bErr) return { content: [{ type: "text", text: bErr.message }], isError: true };
    const result = (versions ?? []).map((v) => ({
      ...v,
      blocks: (blocks ?? []).filter((b) => b.version_id === v.id).sort((a, b) => a.sort_order - b.sort_order),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: { versions: result },
    };
  },
});
