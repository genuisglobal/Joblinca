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

const email = process.argv[2] || process.env.ADMIN_EMAIL || "admin@joblinca.com";
const password = process.argv[3] || process.env.ADMIN_PASSWORD || "StrongPassword123!";
const adminType = process.argv[4] || process.env.ADMIN_TYPE || "super";

const allowedAdminTypes = new Set([
  "super",
  "operations",
  "content",
  "support",
  "recruiter_admin",
  "ai",
]);

if (!allowedAdminTypes.has(adminType)) {
  console.error(
    `Invalid admin type "${adminType}". Use one of: ${Array.from(allowedAdminTypes).join(", ")}`
  );
  process.exit(1);
}

async function main() {
  let userId;
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr && createErr.code !== "email_exists") {
    throw createErr;
  }

  if (created?.user?.id) {
    userId = created.user.id;
    console.log("Created auth user:", userId);
  } else {
    const { data: profileMatch, error: profileLookupErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (profileLookupErr) throw profileLookupErr;

    let existing = profileMatch ? { id: profileMatch.id, email } : null;
    const perPage = 100;

    if (!existing) {
      try {
        for (let page = 1; page <= 100 && !existing; page += 1) {
          const { data: usersPage, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage,
          });
          if (listErr) throw listErr;

          existing = usersPage.users.find(
            (user) => user.email?.toLowerCase() === email.toLowerCase()
          );

          if (usersPage.users.length < perPage) {
            break;
          }
        }
      } catch (listErr) {
        console.warn("Admin user listing failed; trying password sign-in fallback.");
      }
    }

    if (!existing) {
      const { data: signIn, error: signInErr } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password,
      });
      if (!signInErr && signIn.user?.id) {
        existing = { id: signIn.user.id, email };
      }
    }

    if (!existing) {
      throw new Error(`User ${email} already exists but could not be found by admin API.`);
    }

    userId = existing.id;
    console.log("Found existing auth user:", userId);

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });

    if (updateErr) throw updateErr;
    console.log("Updated existing auth user password.");
  }

  const { error: upsertErr } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: userId,
        email,
        role: "admin",
        admin_type: adminType,
        admin_granted_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (upsertErr) throw upsertErr;

  console.log(`Admin profile created successfully for ${email} as ${adminType}.`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
