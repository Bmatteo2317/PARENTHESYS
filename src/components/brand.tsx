import Link from "next/link";

// Il logo resta neutro: una parentesi che contiene e collega, senza suggerire un modello di famiglia.
export function Brand({ large = false }: { large?: boolean }) {
  return (
    <Link className={`brand ${large ? "brand-large" : ""}`} href="/careboard" aria-label="Parenthesys">
      <img className="brand-logo" src="/parenthesys-logo.png" alt="" width={large ? 54 : 30} height={large ? 54 : 30} />
      <span className="brand-name">parenthesys<span>.</span></span>
    </Link>
  );
}
