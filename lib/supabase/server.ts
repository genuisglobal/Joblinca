import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function createServerSupabaseClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // These are required by the type, but in Server Components cookies are read-only.
        // They will be used in Route Handlers / Server Actions where cookies are mutable.
        set() {},
        remove() {},
      },
    }
  );
}
