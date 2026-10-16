import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Parenthesys">
      <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
      <span className="brand-name">parenthesys<span>.</span></span>
    </Link>
  );
}
