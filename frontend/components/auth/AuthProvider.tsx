"use client";

import { useEffect } from "react";
import { getSupabase } from "@/lib/supabase";
import { useBucoStore } from "@/store/useBucoStore";
import type { User } from "@supabase/supabase-js";

function toAuthUser(u: User) {
  return {
    id: u.id,
    email: u.email ?? "",
    displayName:
      (u.user_metadata?.display_name as string) ||
      (u.email ? u.email.split("@")[0] : "you"),
  };
}

/**
 * Restores the cached Supabase session on load and keeps the store in sync
 * with sign-in / sign-out / token-refresh events.
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser = useBucoStore((s) => s.setUser);

  useEffect(() => {
    const supabase = getSupabase();

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) setUser(toAuthUser(data.session.user));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? toAuthUser(session.user) : null);
    });

    return () => sub.subscription.unsubscribe();
  }, [setUser]);

  return <>{children}</>;
}
