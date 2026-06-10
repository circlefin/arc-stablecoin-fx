"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, History } from "lucide-react";

import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Swap", icon: ArrowLeftRight, exact: true },
  { href: "/dashboard/history", label: "History", icon: History, exact: false },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {links.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </Link>
        );
      })}
    </>
  );
}
