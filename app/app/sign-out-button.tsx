"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/5"
    >
      Sign out
    </button>
  );
}
