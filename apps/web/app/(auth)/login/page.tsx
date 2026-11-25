import { AuthForm } from "@/components/auth-form";
import { getT } from "@/lib/i18n/server";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  const t = await getT();
  return <AuthForm notice={reset ? t("Your new password is saved. Log in with it.") : undefined} />;
}
