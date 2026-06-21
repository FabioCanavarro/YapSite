import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const createClient = async () => {
  const cookieStore = await cookies();

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase environment variables are missing on the server! Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.");
  }

  return createServerClient(
    supabaseUrl || 'https://placeholder-project.supabase.co',
    supabaseAnonKey || 'placeholder-anon-key',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
};
export const createAdminClient = () => {
  // Useful for routes where service-role bypass is required (like ingest without active user session)
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createServerClient(
    supabaseUrl || 'https://placeholder-project.supabase.co',
    supabaseServiceKey || supabaseAnonKey || 'placeholder-key',
    {
      cookies: {
        getAll() { return []; },
        setAll() {}
      }
    }
  );
};
