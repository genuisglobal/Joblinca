import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import {
  DEFAULT_LOCALE,
  LOCALE_REQUEST_HEADER,
  addLocalePrefix,
  getPathLocale,
  normalizeLocale,
} from "@/lib/i18n/locale";

export async function GET(request: Request) {
  const cookieStore = cookies();
  const requestUrl = new URL(request.url);
  const locale =
    normalizeLocale(request.headers.get(LOCALE_REQUEST_HEADER)) ||
    getPathLocale(requestUrl.pathname) ||
    DEFAULT_LOCALE;
  const redirectUrl = new URL(addLocalePrefix("/", locale), requestUrl.origin);

  // Create response first so we can set cookies on it
  const response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // Set cookie on the response to clear it
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          // Remove cookie by setting empty value with expired date
          response.cookies.set({
            name,
            value: '',
            ...options,
            maxAge: 0,
          });
        },
      },
    }
  );

  // Sign out - this will trigger the remove callback for auth cookies
  await supabase.auth.signOut();
  response.cookies.set({
    name: "jl_profile_cache",
    value: "",
    path: "/",
    maxAge: 0,
  });

  return response;
}
