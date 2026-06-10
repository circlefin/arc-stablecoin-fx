"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { explorerTxUrl, formatAmount, type FxToken } from "@/lib/fx";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type SwapRow = {
  id: string;
  from_token: FxToken;
  to_token: FxToken;
  amount_in: string;
  quoted_out: string | null;
  min_out: string | null;
  status: "pending" | "submitted" | "confirmed" | "failed";
  tx_hash: string | null;
  created_at: string;
};

type SortKey = "created_at" | "amount_in" | "quoted_out" | "min_out";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];
const SELECT_COLS =
  "id, from_token, to_token, amount_in, quoted_out, min_out, status, tx_hash, created_at";

const statusVariant: Record<SwapRow["status"], "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  submitted: "secondary",
  confirmed: "default",
  failed: "destructive",
};

export function TradesTable({
  userId,
  initial,
  initialTotal,
}: {
  userId: string;
  initial: SwapRow[];
  initialTotal: number;
}) {
  const [rows, setRows] = useState<SwapRow[]>(initial);
  const [total, setTotal] = useState<number>(initialTotal);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [sort, setSort] = useState<SortState>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch((prev) => {
        const next = search.trim();
        if (prev !== next) setPage(1);
        return next;
      });
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const changePageSize = (n: number) => {
    setPageSize(n);
    setPage(1);
  };

  const isFirstFetch = useRef(true);
  useEffect(() => {
    if (isFirstFetch.current) {
      isFirstFetch.current = false;
      const isInitialState =
        page === 1 && pageSize === DEFAULT_PAGE_SIZE && sort === null && debouncedSearch === "";
      if (isInitialState) return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const supabase = createClient();
      let q = supabase
        .from("swaps")
        .select(SELECT_COLS, { count: "exact" })
        .eq("user_id", userId);
      if (debouncedSearch) q = q.ilike("tx_hash", `%${debouncedSearch}%`);
      if (sort) {
        q = q.order(sort.key, { ascending: sort.dir === "asc" });
        if (sort.key !== "created_at") q = q.order("created_at", { ascending: false });
      } else {
        q = q.order("created_at", { ascending: false });
      }
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      q = q.range(from, to);
      const { data, count, error } = await q;
      if (cancelled) return;
      if (error) {
        toast.error("Failed to load trades");
      } else {
        setRows((data ?? []) as SwapRow[]);
        if (typeof count === "number") setTotal(count);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, page, pageSize, sort, debouncedSearch]);

  const realtimeEnabled = page === 1 && sort === null && debouncedSearch === "";
  useEffect(() => {
    if (!realtimeEnabled) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`swaps:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "swaps",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as SwapRow;
            setRows((prev) => [row, ...prev].slice(0, pageSize));
            setTotal((t) => t + 1);
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as SwapRow;
            setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as { id: string };
            setRows((prev) => prev.filter((r) => r.id !== old.id));
            setTotal((t) => Math.max(0, t - 1));
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, pageSize, realtimeEnabled]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const cycleSort = (key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
    setPage(1);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Search by transaction hash"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-sm"
          aria-label="Search by transaction hash"
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => changePageSize(Number(v))}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs tracking-wide text-muted-foreground">
            <tr>
              <SortableHeader label="Time" sortKey="created_at" sort={sort} onClick={cycleSort} align="left" />
              <th className="px-3 py-2 text-left font-medium">Pair</th>
              <SortableHeader label="In" sortKey="amount_in" sort={sort} onClick={cycleSort} align="right" />
              <SortableHeader label="Out" sortKey="quoted_out" sort={sort} onClick={cycleSort} align="right" />
              <SortableHeader label="Min Out" sortKey="min_out" sort={sort} onClick={cycleSort} align="right" />
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Tx Hash</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {debouncedSearch ? "No matches." : "No trades yet."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.from_token} → {row.to_token}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
                    {formatAmount(row.amount_in)} {row.from_token}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
                    {row.quoted_out ? `${formatAmount(row.quoted_out)} ${row.to_token}` : "-"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
                    {row.min_out ? `${formatAmount(row.min_out)} ${row.to_token}` : "-"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={statusVariant[row.status]}>{row.status}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <TxHashCell hash={row.tx_hash} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {total === 0 ? "0 results" : `${rangeStart}–${rangeEnd} of ${total}`}
          {loading ? " · loading…" : ""}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onClick,
  align,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onClick: (k: SortKey) => void;
  align: "left" | "right";
}) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      aria-sort={!active ? "none" : sort.dir === "asc" ? "ascending" : "descending"}
      className={cn("px-3 py-2 font-medium", align === "right" ? "text-right" : "text-left")}
    >
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 tracking-wide transition-colors hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active && "text-foreground",
        )}
      >
        <span>{label}</span>
        <Icon className="size-3" />
      </button>
    </th>
  );
}

function TxHashCell({ hash }: { hash: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!hash) return <span className="text-muted-foreground">-</span>;
  const short = `${hash.slice(0, 6)}…${hash.slice(-4)}`;
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      toast.success("Transaction hash copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  };
  return (
    <div className="flex items-center gap-1">
      <a
        href={explorerTxUrl(hash)}
        target="_blank"
        rel="noopener noreferrer"
        title={hash}
        className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
      >
        {short}
        <ExternalLink className="size-3" />
      </a>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onCopy}
        aria-label={copied ? "Copied" : "Copy transaction hash"}
        className={cn(copied && "text-green-600")}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}
