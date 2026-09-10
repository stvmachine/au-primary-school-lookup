"use client";

import { useEffect, useRef, useState } from "react";
import { LogIn, LogOut, SearchCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function AuthControls() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signInError, setSignInError] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  if (isPending) {
    return (
      <div className="auth-controls" aria-label="Loading sign-in state" aria-busy="true">
        <div className="auth-skeleton" />
      </div>
    );
  }

  const user = session?.user;

  if (!user) {
    return (
      <div className="auth-controls">
        <button
          className="auth-signin-button"
          type="button"
          aria-label="Sign in with Google"
          onClick={() => {
            setSignInError(false);
            authClient.signIn
              .social({ provider: "google", callbackURL: "/history" })
              .catch(() => setSignInError(true));
          }}
        >
          <LogIn size={15} aria-hidden="true" />
          Sign in with Google
        </button>
        {signInError ? (
          <span className="auth-inline-error" role="alert">
            Sign-in isn’t available right now.
          </span>
        ) : null}
      </div>
    );
  }

  const firstName = user.name?.split(" ")[0] || "Account";

  const handleSignOut = async () => {
    setSigningOut(true);
    setMenuOpen(false);
    try {
      await authClient.signOut();
    } finally {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="auth-controls" ref={rootRef}>
      <button
        className="auth-user-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Account menu for ${firstName}`}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span className="auth-avatar">
          {user.image ? (
            <img src={user.image} alt="" />
          ) : (
            firstName.charAt(0).toUpperCase()
          )}
        </span>
        <span className="auth-user-name">{firstName}</span>
      </button>

      {menuOpen ? (
        <div className="auth-menu" role="menu" aria-label="Account menu">
          <span className="auth-menu-email">{user.email}</span>
          <Link className="auth-menu-item" role="menuitem" href="/history" onClick={() => setMenuOpen(false)}>
            <SearchCheck size={15} aria-hidden="true" />
            My searches
          </Link>
          <button
            className="auth-menu-item danger"
            role="menuitem"
            type="button"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
          >
            <LogOut size={15} aria-hidden="true" />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
