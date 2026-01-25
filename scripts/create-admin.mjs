import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const email = "admin@joblinca.com";
const password = "StrongPassword123!";

async function main() {
  const { data: created, error: createErr } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createErr) throw createErr;

  const userId = created.user.id;
  console.log("Created auth user:", userId);

  const { error: upsertErr } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: userId,
        email,
        role: "admin",
        admin_type: "super",
        admin_granted_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (upsertErr) throw upsertErr;

  console.log("Admin profile created successfully for:", email);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
