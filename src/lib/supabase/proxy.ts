import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { validateLoginReturnPath } from "@/features/auth/login-return";
import type { Database } from "@/types/database.types";

import { getSupabaseConfig } from "./config";

export function redirectWithResponseCookies(
  destination: URL,
  sourceResponse: NextResponse,
) {
  const redirectResponse = NextResponse.redirect(destination);

  for (const cookie of sourceResponse.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }

  return redirectResponse;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = getSupabaseConfig();

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  if (!user && pathname.startsWith("/candidatures")) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return redirectWithResponseCookies(loginUrl, response);
  }

  if (user && pathname === "/login") {
    const returnPath = validateLoginReturnPath(
      request.nextUrl.searchParams.get("next"),
    );
    const destinationUrl = new URL(
      returnPath ?? "/candidatures",
      request.url,
    );
    return redirectWithResponseCookies(destinationUrl, response);
  }

  return response;
}
