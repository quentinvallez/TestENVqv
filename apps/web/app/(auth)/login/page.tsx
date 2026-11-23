import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  return <AuthForm notice={reset ? "Your new password is saved. Log in with it." : undefined} />;
}
