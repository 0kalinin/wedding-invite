// Guest-facing API. Auth is by guest `code` (custom), so verify_jwt is disabled.
// GET  /guest?code=XXX            -> guest info + saved RSVP/survey state
// POST /guest { code, patch }     -> auto-save: merges patch into the guest row
//   patch may contain: attendance, plus_one_name_filled, survey (shallow-merged)
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const GUEST_FIELDS =
  "name, gender, has_plus_one, plus_one_name, plus_one_gender, attendance, plus_one_name_filled, survey";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (req.method === "GET") {
      const code = new URL(req.url).searchParams.get("code");
      if (!code) return json({ error: "code required" }, 400);

      const { data, error } = await supabase
        .from("guests")
        .select(GUEST_FIELDS)
        .eq("code", code)
        .maybeSingle();

      if (error) {
        console.error("guest GET error", error);
        return json({
          error: "db_error",
          detail: error.message,
          hasUrl: !!SUPABASE_URL,
          hasKey: !!SERVICE_ROLE_KEY,
        }, 500);
      }
      if (!data) return json({ error: "not_found" }, 404);
      return json(data);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      const code = body?.code;
      const patch = body?.patch ?? {};
      if (!code) return json({ error: "code required" }, 400);

      const { data: current, error: e1 } = await supabase
        .from("guests")
        .select("survey")
        .eq("code", code)
        .maybeSingle();
      if (e1) return json({ error: e1.message }, 500);
      if (!current) return json({ error: "not_found" }, 404);

      const update: Record<string, unknown> = {};
      if ("attendance" in patch) update.attendance = patch.attendance;
      if ("plus_one_name_filled" in patch) {
        update.plus_one_name_filled = patch.plus_one_name_filled;
      }
      if ("survey" in patch && patch.survey && typeof patch.survey === "object") {
        // Shallow merge so partial survey updates don't wipe other answers.
        update.survey = { ...(current.survey ?? {}), ...patch.survey };
      }

      const { data, error } = await supabase
        .from("guests")
        .update(update)
        .eq("code", code)
        .select(GUEST_FIELDS)
        .maybeSingle();

      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    return json({ error: "method_not_allowed" }, 405);
  } catch (err) {
    console.error("guest unhandled error", err);
    return json({ error: "exception", detail: String(err) }, 500);
  }
});
