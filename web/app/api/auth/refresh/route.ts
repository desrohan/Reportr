import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Exchanges a refresh token for a fresh session. Used by the Chrome extension,
// which stores a synced session but can't refresh it itself (offscreen/service
// worker contexts, no Supabase client). Keeps the Supabase keys server-side.
export async function POST(req: Request) {
  try {
    const { refresh_token } = await req.json();
    if (!refresh_token) {
      return NextResponse.json({ error: "Missing refresh_token" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });
    if (error || !data.session) {
      return NextResponse.json({ error: error?.message || "Refresh failed" }, { status: 401 });
    }

    return NextResponse.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
