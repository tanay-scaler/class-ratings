import { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { verifyUserAccess } from "./data";

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "MOCK_GOOGLE_CLIENT_ID",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "MOCK_GOOGLE_CLIENT_SECRET",
    }),
  ],
  callbacks: {
    // Determine whether the user is allowed to sign in
    async signIn({ user }) {
      console.log("[NextAuth] signIn callback triggered for user:", user);
      if (!user.email) {
        console.log("[NextAuth] Access denied: No email in user object");
        return false;
      }

      const { authorized, role } = await verifyUserAccess(user.email);
      console.log(`[NextAuth] Access check for ${user.email}: authorized=${authorized}, role=${role}`);
      return authorized;
    },
    // Inject the user's role into the JWT token from our ACL database
    async jwt({ token, user }) {
      if (user?.email) {
        const { role } = await verifyUserAccess(user.email);
        token.role = role;
        console.log(`[NextAuth] JWT token updated with role=${role} for ${user.email}`);
      }
      return token;
    },
    // Inject the user's role from JWT token into the frontend session
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role || 'Viewer';
        console.log("[NextAuth] Session callback: role =", (session.user as any).role);
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET || "scaler_low_ratings_dashboard_secret_key_2026",
};
