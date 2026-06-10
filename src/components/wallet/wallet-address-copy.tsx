"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export function WalletAddressCopy({
  address,
  className,
}: {
  address: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? "Address copied" : "Copy wallet address"}
      title={address}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      <span>{short}</span>
      {copied ? (
        <CheckIcon className="size-3.5 text-emerald-500" aria-hidden />
      ) : (
        <CopyIcon className="size-3.5" aria-hidden />
      )}
      <span className="sr-only">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
