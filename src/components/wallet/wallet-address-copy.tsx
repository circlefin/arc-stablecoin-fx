/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

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
