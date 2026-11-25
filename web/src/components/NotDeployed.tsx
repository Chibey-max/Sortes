import { isDeployed } from "@/lib/config";

export function NotDeployed() {
  if (isDeployed) return null;
  return (
    <div className="banner bad">
      Contracts are not configured. Set <span className="mono">NEXT_PUBLIC_HOUSE</span> and{" "}
      <span className="mono">NEXT_PUBLIC_MINT</span> (see <span className="mono">web/.env.example</span>).
    </div>
  );
}
