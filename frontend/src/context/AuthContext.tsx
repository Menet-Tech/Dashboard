import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { fetchCurrentUser, login, logout, registerOnUnauthorized } from "../lib/api";
import type { User } from "../types";
import { useAppFeedback } from "./FeedbackContext";

type AuthContextType = {
  user: User | null;
  authLoading: boolean;
  handleLogin: (user: User) => void;
  handleLogout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const feedback = useAppFeedback();

  useEffect(() => {
    registerOnUnauthorized(() => {
      setUser(null);
    });

    let cancelled = false;
    async function bootAuth() {
      try {
        const current = await fetchCurrentUser();
        if (!cancelled) setUser(current.user);
      } catch (error: any) {
        // Ignore 401 on boot
        if (!cancelled && !(error?.status === 401)) {
          // feedback.pushError("Failed to fetch user");
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }
    void bootAuth();
    return () => { cancelled = true; };
  }, []);

  const handleLogin = useCallback((loggedInUser: User) => {
    setUser(loggedInUser);
  }, []);

  const handleLogout = useCallback(async () => {
    await feedback.withFeedback(async () => {
      await logout();
      setUser(null);
      feedback.pushSuccess("Sesi berhasil ditutup.");
    }, "logout");
  }, [feedback]);

  return (
    <AuthContext.Provider value={{ user, authLoading, handleLogin, handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
