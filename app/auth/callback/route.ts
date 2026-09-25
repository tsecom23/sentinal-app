import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code       = requestUrl.searchParams.get("code");
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type       = requestUrl.searchParams.get("type") as "invite" | "signup" | "magiclink" | "recovery" | "email_change" | null;

  const supabase = await createClient();

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  } else if (token_hash && type) {
    await supabase.auth.verifyOtp({ token_hash, type });
  }

  return NextResponse.redirect(new URL("/", requestUrl.origin));
}