// Admin API. Protected by the `x-admin-token` header, checked against
// app_config.admin_token. verify_jwt is disabled (custom auth).
// GET  /admin                              -> all guests (full details) + personal links
// POST /admin { upsert: [...], delete: [...] }
//   upsert item: { code?, name, gender, has_plus_one, plus_one_name }
//     - with code: update existing (or insert with that code if missing)
//     - without code: insert new guest with a generated code
//   delete: array of codes to remove
//   returns the full updated guest list with links
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Where the static site lives; used to build each guest's personal link.
const SITE_URL = Deno.env.get("SITE_URL") ??
  "https://0kalinin.github.io/wedding-invite/";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function genCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function isAdmin(req: Request): Promise<boolean> {
  const token = req.headers.get("x-admin-token");
  if (!token) return false;
  const { data } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "admin_token")
    .maybeSingle();
  return !!data && data.value === token;
}

async function listWithLinks() {
  const { data } = await supabase
    .from("guests")
    .select("*")
    .order("created_at");
  return (data ?? []).map((g) => ({ ...g, link: `${SITE_URL}?code=${g.code}` }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!(await isAdmin(req))) return json({ error: "unauthorized" }, 401);

  try {
    if (req.method === "GET") {
      return json({ guests: await listWithLinks() });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      const upsert = Array.isArray(body?.upsert) ? body.upsert : [];
      const del = Array.isArray(body?.delete) ? body.delete : [];

      for (const code of del) {
        await supabase.from("guests").delete().eq("code", code);
      }

      for (const item of upsert) {
        const fields: Record<string, unknown> = {};
        if ("name" in item) fields.name = item.name;
        if ("gender" in item) fields.gender = item.gender ?? null;
        if ("has_plus_one" in item) fields.has_plus_one = !!item.has_plus_one;
        if ("plus_one_name" in item) fields.plus_one_name = item.plus_one_name ?? null;

        if (item.code) {
          const { data: existing } = await supabase
            .from("guests")
            .select("id")
            .eq("code", item.code)
            .maybeSingle();
          if (existing) {
            await supabase.from("guests").update(fields).eq("code", item.code);
          } else {
            await supabase.from("guests").insert({
              code: item.code,
              name: item.name ?? "Гость",
              gender: item.gender ?? null,
              has_plus_one: !!item.has_plus_one,
              plus_one_name: item.plus_one_name ?? null,
            });
          }
        } else {
          await supabase.from("guests").insert({
            code: genCode(),
            name: item.name ?? "Гость",
            gender: item.gender ?? null,
            has_plus_one: !!item.has_plus_one,
            plus_one_name: item.plus_one_name ?? null,
          });
        }
      }

      return json({ guests: await listWithLinks() });
    }

    return json({ error: "method_not_allowed" }, 405);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
