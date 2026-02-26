import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const usage = () => {
  console.log("Usage:");
  console.log("  node scripts/verify-existing-users.mjs email1@example.com email2@example.com");
  console.log("  node scripts/verify-existing-users.mjs --file emails.txt");
};

const args = process.argv.slice(2);
if (args.length === 0) {
  usage();
  process.exit(1);
}

const url =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!url || !serviceKey) {
  console.error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const readEmailsFromFile = async (filePath) => {
  const absPath = path.resolve(process.cwd(), filePath);
  const raw = await fs.readFile(absPath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
};

let emails = [];
if (args[0] === "--file") {
  const filePath = args[1];
  if (!filePath) {
    usage();
    process.exit(1);
  }
  emails = await readEmailsFromFile(filePath);
} else {
  emails = args;
}

if (emails.length === 0) {
  console.error("No emails provided.");
  process.exit(1);
}

const listUsersFallback = async (emailLower) => {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) {
    return { user: null, error };
  }
  const user = (data?.users || []).find(
    (u) => (u.email || "").toLowerCase() === emailLower
  );
  return { user: user || null, error: null };
};

for (const email of emails) {
  const emailLower = email.toLowerCase();
  let authUser = null;
  let authError = null;

  if (typeof supabase.auth.admin.getUserByEmail === "function") {
    const { data, error } = await supabase.auth.admin.getUserByEmail(emailLower);
    authError = error || null;
    authUser = data?.user || null;
  } else {
    const { user, error } = await listUsersFallback(emailLower);
    authError = error || null;
    authUser = user || null;
  }

  let profile = null;
  if (authUser?.id) {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, role, full_name")
      .eq("id", authUser.id)
      .maybeSingle();
    profile = data || null;
  }

  if (!profile) {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, role, full_name")
      .eq("email", emailLower)
      .maybeSingle();
    profile = data || null;
  }

  const confirmedAt =
    authUser?.email_confirmed_at || authUser?.confirmed_at || null;

  console.log(`\n${email}`);
  if (authError) {
    console.log(`  auth_error: ${authError.message || authError}`);
  }
  console.log(`  auth_user: ${authUser ? "YES" : "NO"}`);
  if (authUser) {
    console.log(`  auth_user_id: ${authUser.id}`);
    console.log(`  email_confirmed_at: ${confirmedAt || "NO"}`);
    console.log(`  last_sign_in_at: ${authUser.last_sign_in_at || "NO"}`);
  }
  console.log(`  profile: ${profile ? "YES" : "NO"}`);
  if (profile) {
    console.log(
      `  profile_id: ${profile.id} | role: ${profile.role || "NO"} | name: ${
        profile.full_name || "NO"
      }`
    );
  }
}
