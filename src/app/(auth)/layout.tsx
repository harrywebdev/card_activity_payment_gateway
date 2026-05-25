import { requireUser } from "@/lib/auth";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Redirects to /login if no session.
  await requireUser();
  return <>{children}</>;
}
