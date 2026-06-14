import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Bell,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  FileText,
  FolderOpen,
  Gauge,
  Globe,
  HardDrive,
  LayoutDashboard,
  Loader2,
  Package,
  Search,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  Tag,
  Users,
  X,
} from "lucide-react";
import { api } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SearchResultType =
  | "page"
  | "project"
  | "environment"
  | "project_tab"
  | "client"
  | "server";

interface SearchResult {
  type: SearchResultType;
  id: string;
  label: string;
  subtitle?: string;
  path: string;
  icon?: string;
}

const ICONS: Record<string, React.ElementType> = {
  Activity,
  AlertTriangle,
  Bell,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  FileText,
  FolderOpen,
  Gauge,
  Globe,
  HardDrive,
  LayoutDashboard,
  Package,
  Search,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  Tag,
  Users,
};

const TYPE_LABELS: Record<SearchResultType, string> = {
  page: "Pages",
  project: "Projects",
  environment: "Environments",
  project_tab: "Project Tabs",
  client: "Clients",
  server: "Servers",
};

const TYPE_TONES: Record<SearchResultType, string> = {
  page: "text-muted-foreground",
  project: "text-warning",
  environment: "text-info",
  project_tab: "text-primary",
  client: "text-info",
  server: "text-success",
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 180);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", debouncedQuery],
    queryFn: () =>
      api.get<{ items: SearchResult[] }>(
        `/search?q=${encodeURIComponent(debouncedQuery)}&limit=8`,
      ),
    enabled: open,
    staleTime: debouncedQuery ? 5_000 : 30_000,
  });

  const allItems = data?.items ?? [];

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery]);

  const handleSelect = (item: SearchResult) => {
    navigate(item.path);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (allItems[activeIndex]) handleSelect(allItems[activeIndex]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="p-0 max-w-2xl gap-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, projects, environments, tabs…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {isFetching && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          )}
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[28rem] overflow-y-auto py-2">
          {isFetching && allItems.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching…
            </div>
          ) : allItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No results found.
            </p>
          ) : null}

          {allItems.map((item, i) => {
            const prevItem = allItems[i - 1];
            const groupLabel =
              !prevItem || prevItem.type !== item.type
                ? TYPE_LABELS[item.type]
                : null;
            const Icon =
              item.icon && ICONS[item.icon] ? ICONS[item.icon] : Search;

            return (
              <div key={`${item.type}-${item.id}`}>
                {groupLabel && (
                  <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none">
                    {groupLabel}
                  </div>
                )}
                <button
                  type="button"
                  data-index={i}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                    i === activeIndex
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${TYPE_TONES[item.type]}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.label}</span>
                    {item.subtitle && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.subtitle}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {item.type === "project_tab"
                      ? "Tab"
                      : item.type[0].toUpperCase() + item.type.slice(1)}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="border-t px-4 py-2 flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            <kbd className="font-mono">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="font-mono">↵</kbd> select
          </span>
          <span>
            <kbd className="font-mono">Esc</kbd> close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
