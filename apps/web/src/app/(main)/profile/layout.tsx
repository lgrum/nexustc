import { auth } from "@repo/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/auth");
  }

  return children;
}
