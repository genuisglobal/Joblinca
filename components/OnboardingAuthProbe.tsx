"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client"; // adjust if needed

export default function OnboardingAuthProbe({
  role,
}: {
  role: "job_seeker" | "talent";
}) {
  const supabase = createClient();
  const [state, setState] = useState<any>({ loading: true });

  useEffect(() => {
    const run = async () => {
      const { data: userData, error: userErr } =
        await supabase.auth.getUser();

      if (!userData?.user) {
        setState({
          loading: false,
          user: null,
          userErr: userErr?.message ?? null,
        });
        return;
      }

      const uid = userData.user.id;

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", uid)
        .maybeSingle();

      const table =
        role === "job_seeker"
          ? "job_seeker_profiles"
          : "talent_profiles";

      // ⚠️ IMPORTANT: role tables use user_id
      const { data: roleProfile, error: roleErr } = await supabase
        .from(table)
        .select("*")
        .eq("user_id", uid)
        .maybeSingle();

      setState({
        loading: false,
        user: {
          id: uid,
          email: userData.user.email,
        },
        profile,
        profileErr: profileErr?.message ?? null,
        roleTable: table,
        roleProfileFound: !!roleProfile,
        roleErr: roleErr?.message ?? null,
      });
    };

    run();
  }, [role]);

  return (
    <pre className="mt-6 p-4 text-xs bg-black text-green-400 overflow-auto">
      {JSON.stringify(state, null, 2)}
    </pre>
  );
}
