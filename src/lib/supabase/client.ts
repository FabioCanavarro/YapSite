import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const createClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    if (typeof window !== 'undefined') {
      console.warn("Supabase environment variables are missing! Make sure to set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    }
  }
  return createBrowserClient(
    supabaseUrl || 'https://placeholder-project.supabase.co',
    supabaseAnonKey || 'placeholder-anon-key'
  );
};
