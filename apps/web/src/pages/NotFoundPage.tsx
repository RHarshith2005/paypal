import { LinkButton } from "../components/ui";

export function NotFoundPage() {
  return (
    <div className="panel p-10 text-center">
      <p className="mono-label">404</p>
      <h1 className="mt-3 text-2xl font-semibold text-white">This route does not exist</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
        The page you asked for is not part of Handshake. Deals and disputes are reached by their ids from the ledger or
        a receipt.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <LinkButton to="/">Back to overview</LinkButton>
        <LinkButton to="/ledger" tone="ghost">
          Open ledger
        </LinkButton>
      </div>
    </div>
  );
}
