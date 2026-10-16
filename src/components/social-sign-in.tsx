import { signInWithProvider } from "@/app/actions/auth";

const enabledProviders = [
  ["google", process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET, "Continua con Google"],
  ["apple", process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET, "Continua con Apple"],
] as const;

export function SocialSignIn() {
  const providers = enabledProviders.filter((provider) => provider[1]);
  if (!providers.length) return null;

  return (
    <>
      <div className="auth-divider">oppure</div>
      <div className="auth-methods">
        {providers.map(([provider, , label]) => (
          <form action={signInWithProvider} key={provider}>
            <input type="hidden" name="provider" value={provider} />
            <button className="outline-button" type="submit" style={{ width: "100%" }}>{label}</button>
          </form>
        ))}
      </div>
    </>
  );
}
