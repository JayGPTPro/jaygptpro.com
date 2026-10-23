import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handle } from "./handler.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const salt = Deno.env.get("HIRING_LINKS_SALT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!.slice(-24);

Deno.serve((req) =>
  handle(req, {
    salt,
    insert: async (row) => {
      const { error } = await supabase.from("hiring_link_clicks").insert(row);
      if (error) throw error;
    },
    rows: async () => {
      const { data, error } = await supabase
        .from("hiring_link_clicks")
        .select("code, created_at, ref_domain, is_bot, is_repeat, visitor_hash")
        .order("created_at", { ascending: true })
        .limit(20000);
      if (error) throw error;
      return data ?? [];
    },
  })
);
