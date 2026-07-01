import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.");
}

// Browser-safe client — uses the public anon key, which is subject to
// whatever Row Level Security policies exist on each table. Never import
// SUPABASE_SECRET_KEY into a module reachable from client components; that
// key belongs only in server-only code (route handlers, server actions).
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
