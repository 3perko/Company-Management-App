/**
 * Universal DataTable (master prompt 2.11): column chooser from all entity fields, drag & drop order, resizable
 * widths, multi-level sorting, typed filters, full-text search, saved views (per user, shareable), server-side
 * paging/sorting/filtering, totals of all filtered rows, grouping with group totals, active/inactive switch,
 * export of the current view, row detail, bulk actions and a card layout on mobile.
 *
 * Toolbar: search · Filter · (page buttons) · Zobrazenie (columns, grouping, inactive, saved views) · ⋯ (export,
 * refresh) · Nový. Everything that is currently switched on is listed as chips under the toolbar.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  flexRender, getCoreRowModel, useReactTable, type ColumnDef, type ColumnSizingState, type RowSelectionState,
} from "@tanstack/react-table";
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download, MoreHorizontal, Plus, RefreshCw, Search, Star,
} from "lucide-react";
import { api, linkUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { EntityMeta, FieldMeta, Filter, ListResult, Row, SavedView, SortSpec, ViewConfig } from "@/lib/types";
import { Cell, cellText, defaultWidth, isNumeric } from "./cells";
import { EntityDrawer } from "./EntityDrawer";
import { Chip, FilterButton, FilterChips } from "./FilterBar";
import { RefSelect } from "./inputs";
import { Empty, MenuButton, Modal, Spinner, useConfirm, useToast } from "./ui";

export interface DataTableProps {
  entity: string;
  /** separates saved views / last state when the same entity is shown on several pages */
  viewKey?: string;
  /** always applied, not editable by user (e.g. doc_type = receipt) */
  fixedFilters?: Filter[];
  /** initial config when the user has no saved state */
  initial?: ViewConfig;
  toolbar?: ReactNode;
  onOpen?: (row: Row) => void;
  createDefaults?: Record<string, unknown>;
  hideCreate?: boolean;
  onCreate?: () => void;
  compact?: boolean;
}

const PAGE_SIZES = [25, 50, 100];
const SEL_COL = "_sel";

function sortToParam(s: SortSpec[] | undefined) {
  return (s ?? []).map((x) => `${x.key}:${x.dir}`).join(",");
}

/** 1 záznam, 2–4 záznamy, 0 / 5+ záznamov */
function recordsWord(n: number) {
  return n === 1 ? "záznam" : n >= 2 && n <= 4 ? "záznamy" : "záznamov";
}

export function useEntityMeta(entity: string) {
  return useQuery({ queryKey: ["meta", entity], queryFn: () => api.get<EntityMeta>(`/api/meta/${entity}/fields`), staleTime: 300_000 });
}

// Columns, filters, paging and the "last state" autosave all live in component state, so the table
// must remount whenever it starts showing a different entity / view (e.g. Bločky → Prijaté faktúry).
export function DataTable(props: DataTableProps) {
  return <DataTableInner key={props.viewKey ?? props.entity} {...props} />;
}

function DataTableInner(props: DataTableProps) {
  const { entity, fixedFilters = [], toolbar, initial } = props;
  const vk = props.viewKey ?? entity;
  const meta = useEntityMeta(entity);
  const views = useQuery({
    queryKey: ["views", vk],
    queryFn: () => api.get<{ views: SavedView[]; last: SavedView | null }>("/api/views", { entity: vk }),
    staleTime: 60_000,
  });
  const [cfg, setCfg] = useState<ViewConfig | null>(null);
  const [activeView, setActiveView] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [drawer, setDrawer] = useState<{ id: number | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { isAdmin } = useAuth();

  const fields = meta.data?.fields ?? [];
  const fmap = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);

  // ---- initialise from default view / last state / initial / field defaults
  useEffect(() => {
    if (cfg || !meta.data || !views.data) return;
    const def = views.data.views.find((v) => v.is_default && v.own) ?? null;
    const base: ViewConfig = {
      columns: meta.data.fields.filter((f) => f.default_visible).map((f) => f.key),
      sort: meta.data.default_sort.split(",").filter(Boolean).map((s) => {
        const [key, dir] = s.split(":");
        return { key, dir: (dir as "asc" | "desc") || "asc" };
      }),
      filters: [], pageSize: 50, widths: {},
      ...initial,
    };
    const chosen = def?.config ?? views.data.last?.config ?? {};
    const merged = { ...base, ...chosen };
    merged.columns = (merged.columns ?? []).filter((c) => meta.data.fields.some((f) => f.key === c));
    if (!merged.columns.length) merged.columns = base.columns;
    setCfg(merged);
    setQInput(merged.q ?? "");
    if (def) setActiveView(def.id);
  }, [cfg, meta.data, views.data, initial]);

  // ---- remember last state on the server (debounced)
  const firstSave = useRef(true);
  useEffect(() => {
    if (!cfg) return;
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    const t = setTimeout(() => {
      api.put(`/api/views/last/${encodeURIComponent(vk)}`, { config: cfg }).catch(() => undefined);
    }, 1000);
    return () => clearTimeout(t);
  }, [cfg, vk]);

  // ---- debounce fulltext
  useEffect(() => {
    if (!cfg) return;
    const t = setTimeout(() => {
      if ((cfg.q ?? "") !== qInput) {
        setCfg({ ...cfg, q: qInput });
        setPage(1);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [qInput, cfg]);

  const params = useMemo(() => {
    if (!cfg) return null;
    const cols = cfg.columns ?? [];
    return {
      columns: cols.join(","),
      sort: sortToParam(cfg.sort),
      filter: JSON.stringify([...fixedFilters, ...(cfg.filters ?? [])]),
      q: cfg.q || undefined,
      page,
      page_size: cfg.pageSize ?? 50,
      group_by: cfg.groupBy || undefined,
      include_inactive: cfg.includeInactive || undefined,
    };
  }, [cfg, page, fixedFilters]);

  const data = useQuery({
    queryKey: ["data", entity, params],
    queryFn: () => api.get<ListResult>(`/api/data/${entity}`, params!),
    enabled: !!params,
    placeholderData: (prev) => prev,
  });

  const update = (patch: Partial<ViewConfig>) => {
    setCfg((c) => ({ ...(c ?? {}), ...patch }));
    setPage(1);
    setActiveView(null);
  };

  // ---- columns for TanStack Table
  const visibleFields: FieldMeta[] = useMemo(
    () => (cfg?.columns ?? []).map((k) => fmap.get(k)).filter(Boolean) as FieldMeta[],
    [cfg?.columns, fmap],
  );
  const canSelect = (meta.data?.actions.length ?? 0) > 0;
  const columns = useMemo<ColumnDef<Row>[]>(() => {
    const cols: ColumnDef<Row>[] = visibleFields.map((f) => ({
      id: f.key,
      accessorFn: (r) => r[f.key],
      header: f.label,
      size: cfg?.widths?.[f.key] ?? defaultWidth(f),
      minSize: 50,
      cell: (c) => <Cell field={f} row={c.row.original} />,
    }));
    if (canSelect) {
      cols.unshift({
        id: SEL_COL, size: 40, enableResizing: false,
        header: ({ table }) => (
          <input type="checkbox" className="accent-brand-600" checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()} aria-label="Označiť všetko" />
        ),
        cell: ({ row }) => (
          <input type="checkbox" className="accent-brand-600" checked={row.getIsSelected()} onClick={(e) => e.stopPropagation()}
            onChange={row.getToggleSelectedHandler()} aria-label="Označiť riadok" />
        ),
      });
    }
    return cols;
  }, [visibleFields, cfg?.widths, canSelect]);

  const sizing: ColumnSizingState = cfg?.widths ?? {};
  const table = useReactTable({
    data: data.data?.rows ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    getRowId: (r) => String(r.id),
    state: { columnSizing: sizing, rowSelection: selection },
    onRowSelectionChange: setSelection,
    onColumnSizingChange: (u) => {
      const next = typeof u === "function" ? u(sizing) : u;
      setCfg((c) => ({ ...(c ?? {}), widths: { ...(c?.widths ?? {}), ...next } }));
    },
  });

  const selectedIds = Object.keys(selection).filter((k) => selection[k]).map(Number);

  const toggleSort = (key: string, multi: boolean) => {
    const f = fmap.get(key);
    if (!f?.sortable) return;
    const cur = cfg?.sort ?? [];
    const ex = cur.find((s) => s.key === key);
    let next: SortSpec[];
    if (!ex) next = multi ? [...cur, { key, dir: "asc" }] : [{ key, dir: "asc" }];
    else if (ex.dir === "asc") next = cur.map((s) => (s.key === key ? { key, dir: "desc" } : s));
    else next = multi ? cur.filter((s) => s.key !== key) : [];
    if (!multi && ex) next = ex.dir === "asc" ? [{ key, dir: "desc" }] : [];
    update({ sort: next });
  };

  // drag & drop in header
  const dragCol = useRef<string | null>(null);
  const onDrop = (target: string) => {
    const src = dragCol.current;
    if (!src || src === target || !cfg?.columns) return;
    const cols = cfg.columns.filter((c) => c !== src);
    cols.splice(cols.indexOf(target), 0, src);
    update({ columns: cols });
  };

  const open = (row: Row) => {
    if (props.onOpen) return props.onOpen(row);
    if (meta.data?.detail_url) return navigate(meta.data.detail_url.replace("{id}", String(row.id)));
    setDrawer({ id: row.id });
  };

  const exportUrl = (format: string) =>
    linkUrl(`/api/data/${entity}/export`, { ...(params ?? {}), page: undefined, page_size: undefined, group_by: undefined, format });
  // the export endpoint answers with an attachment, so following the link downloads the file and the page stays
  const download = (format: string) => {
    const a = document.createElement("a");
    a.href = exportUrl(format);
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const refresh = async () => {
    const r = await data.refetch();
    if (r.isError) toast.error(r.error);
    else toast.ok("Údaje obnovené");
  };

  // ---- bulk actions
  const [payloadAction, setPayloadAction] = useState<string | null>(null);
  const [payloadProject, setPayloadProject] = useState<number | null>(null);
  const runAction = useMutation({
    mutationFn: ({ key, payload }: { key: string; payload?: Record<string, unknown> }) =>
      api.post<{ message: string }>(`/api/data/${entity}/actions/${key}`, { ids: selectedIds, payload }),
    onSuccess: (r) => {
      toast.ok(r.message ?? "Hotovo");
      setSelection({});
      void qc.invalidateQueries({ queryKey: ["data"] });
    },
    onError: (e) => toast.error(e),
  });
  const startAction = async (a: EntityMeta["actions"][number]) => {
    if (a.payload === "project") {
      setPayloadAction(a.key);
      return;
    }
    if (a.confirm && !(await confirm(a.confirm, a.label, false))) return;
    runAction.mutate({ key: a.key });
  };

  if (meta.isError) return <Empty>{(meta.error as Error).message}</Empty>;
  if (!meta.data || !cfg) return <div className="p-6"><Spinner /></div>;

  const res = data.data;
  const pageSize = cfg.pageSize ?? 50;
  const totalPages = res ? Math.max(1, Math.ceil(res.total / pageSize)) : 1;
  // a size remembered from before (e.g. 200) stays selectable so the select never shows a wrong value
  const pageSizes = PAGE_SIZES.includes(pageSize) ? PAGE_SIZES : [...PAGE_SIZES, pageSize].sort((a, b) => a - b);
  const numericVisible = visibleFields.filter((f) => isNumeric(f) && f.aggregate);
  const groupField = cfg.groupBy ? fmap.get(cfg.groupBy) : undefined;
  const groupMap = new Map((res?.groups ?? []).map((g) => [JSON.stringify(g.value), g]));
  const filters = cfg.filters ?? [];
  const savedViews = views.data?.views ?? [];
  const currentView = savedViews.find((v) => v.id === activeView);
  const showInactive = meta.data.has_active && !!cfg.includeInactive;
  const hasChips = !!currentView || filters.length > 0 || !!groupField || showInactive;
  const firstDataCol = canSelect ? 1 : 0;
  // "Spolu (N)" sits in the first data column; only when that column shows a total itself it moves to the checkbox column
  const firstField = visibleFields[0];
  const totalsLabelCol = canSelect && firstField && res?.totals?.[firstField.key] == null ? 1 : 0;

  const rows = table.getRowModel().rows;

  const footer = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
      <span>{res ? `${res.total} ${recordsWord(res.total)}` : ""}{data.isFetching && <Spinner className="ml-2 inline" />}</span>
      <span className="grow" />
      <select className="input w-auto py-1 text-xs" value={pageSize} aria-label="Počet na stranu"
        onChange={(e) => update({ pageSize: Number(e.target.value) })}>
        {pageSizes.map((n) => <option key={n} value={n}>{n} na stranu</option>)}
      </select>
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Predchádzajúca strana"><ChevronLeft className="h-4 w-4" /></button>
        <span className="tabular-nums">{page} / {totalPages}</span>
        <button type="button" className="btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Ďalšia strana"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );

  return (
    <div className="space-y-2.5">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-[260px] flex-initial">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input type="search" className="input py-1 pl-8" placeholder="Hľadať…" aria-label="Hľadať v tabuľke"
            value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </div>
        <FilterButton fields={fields} filters={filters} onChange={(f) => update({ filters: f })} />
        <span className="grow" />
        {toolbar}
        <button type="button" className="btn-secondary btn-sm" onClick={() => setSettingsOpen(true)}
          title="Stĺpce, zoskupenie a uložené pohľady">
          <Columns3 className="h-3.5 w-3.5" /> Zobrazenie
        </button>
        <MenuButton className="btn-secondary btn-sm" ariaLabel="Ďalšie možnosti" title="Ďalšie možnosti"
          icon={<MoreHorizontal className="h-4 w-4" />}
          items={[
            { label: "Export do XLSX", icon: <Download className="h-4 w-4" />, onClick: () => download("xlsx") },
            { label: "Export do CSV", icon: <Download className="h-4 w-4" />, onClick: () => download("csv") },
            "sep",
            { label: "Obnoviť údaje", icon: <RefreshCw className="h-4 w-4" />, onClick: () => void refresh() },
          ]} />
        {meta.data.can_create && !props.hideCreate && (
          <button type="button" className="btn-primary btn-sm" onClick={() => (props.onCreate ? props.onCreate() : setDrawer({ id: null }))}>
            <Plus className="h-3.5 w-3.5" /> Nový
          </button>
        )}
      </div>

      {/* what is switched on right now */}
      {hasChips && (
        <div className="flex flex-wrap items-center gap-1.5">
          {currentView && (
            <Chip><Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" /> {currentView.name}</Chip>
          )}
          <FilterChips fields={fields} filters={filters} onChange={(f) => update({ filters: f })} />
          {groupField && (
            <Chip onRemove={() => update({ groupBy: null })} removeLabel="Zrušiť zoskupenie">Zoskupené: {groupField.label}</Chip>
          )}
          {showInactive && (
            <Chip onRemove={() => update({ includeInactive: false })} removeLabel="Skryť neaktívne">vrátane neaktívnych</Chip>
          )}
          {filters.length > 1 && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => update({ filters: [] })}>zrušiť všetky filtre</button>
          )}
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-brand-50 px-3 py-2 text-sm dark:bg-slate-800">
          <span className="font-medium">Označené: {selectedIds.length}</span>
          {meta.data.actions.map((a) => (
            <button key={a.key} type="button" className="btn-secondary btn-sm" disabled={runAction.isPending} onClick={() => void startAction(a)}>{a.label}</button>
          ))}
          <button type="button" className="btn-ghost btn-sm" onClick={() => setSelection({})}>Zrušiť výber</button>
        </div>
      )}

      {/* desktop table + footer in one card */}
      <div className="card hidden md:block">
        <div className="overflow-x-auto rounded-t-lg">
          <table className="w-full table-fixed border-collapse" style={{ minWidth: table.getTotalSize() }}>
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const f = fmap.get(h.id);
                    const s = cfg.sort?.findIndex((x) => x.key === h.id) ?? -1;
                    const dir = s >= 0 ? cfg.sort![s].dir : null;
                    return (
                      <th key={h.id} className={`th relative px-3 py-2.5 ${f && isNumeric(f) ? "text-right" : ""}`} style={{ width: h.getSize() }}
                        draggable={!!f} onDragStart={() => (dragCol.current = h.id)} onDragOver={(e) => e.preventDefault()}
                        onDrop={() => onDrop(h.id)}>
                        <button type="button" className={`inline-flex max-w-full items-center gap-1 ${f?.sortable ? "cursor-pointer" : "cursor-default"}`}
                          onClick={(e) => f && toggleSort(h.id, e.shiftKey)}
                          title={f ? (f.sortable ? "Kliknutím zoradíte (Shift = viac stĺpcov), potiahnutím presuniete" : "Potiahnutím presuniete") : undefined}>
                          <span className="truncate">{flexRender(h.column.columnDef.header, h.getContext())}</span>
                          {dir === "asc" && <ArrowUp className="h-3 w-3 shrink-0" />}
                          {dir === "desc" && <ArrowDown className="h-3 w-3 shrink-0" />}
                          {s >= 0 && (cfg.sort?.length ?? 0) > 1 && <sup className="text-[10px]">{s + 1}</sup>}
                        </button>
                        {h.column.getCanResize() && (
                          <div onMouseDown={h.getResizeHandler()} onTouchStart={h.getResizeHandler()}
                            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-brand-500/40" />
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const gv = groupField ? r.original[groupField.key] : undefined;
                const prev = i > 0 ? rows[i - 1].original[groupField?.key ?? ""] : Symbol();
                const showGroup = groupField && (i === 0 || JSON.stringify(gv) !== JSON.stringify(prev));
                const g = showGroup ? groupMap.get(JSON.stringify(gv ?? null)) : undefined;
                return (
                  <Fragment key={r.id}>
                    {showGroup && (
                      <tr className="bg-slate-100/70 dark:bg-slate-800/60">
                        {table.getVisibleLeafColumns().map((c, ci) => {
                          const f = fmap.get(c.id);
                          if (ci === firstDataCol)
                            return <td key={c.id} className="td px-3 py-2 font-semibold">{cellText(groupField, r.original) || "—"} ({g?.count ?? ""})</td>;
                          if (f && isNumeric(f) && g && g.totals[f.key] != null)
                            return <td key={c.id} className="td num px-3 py-2 font-semibold">{cellText(f, { id: 0, [f.key]: g.totals[f.key] })}</td>;
                          return <td key={c.id} className="td px-3 py-2" />;
                        })}
                      </tr>
                    )}
                    <tr className={`cursor-pointer hover:bg-brand-50/60 dark:hover:bg-slate-800/60 ${r.original.active === false ? "text-slate-400" : ""}`}
                      onClick={() => open(r.original)}>
                      {r.getVisibleCells().map((c) => (
                        <td key={c.id} className="td overflow-hidden px-3 py-2" style={{ width: c.column.getSize() }}
                          onClick={c.column.id === SEL_COL ? (e) => e.stopPropagation() : undefined}>
                          {flexRender(c.column.columnDef.cell, c.getContext())}
                        </td>
                      ))}
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
            {numericVisible.length > 0 && res && res.total > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-semibold dark:bg-slate-800/60">
                  {table.getVisibleLeafColumns().map((c, ci) => {
                    const f = fmap.get(c.id);
                    if (ci === totalsLabelCol) return <td key={c.id} className="td whitespace-nowrap px-3 py-2 text-xs text-slate-500">Spolu ({res.total})</td>;
                    return <td key={c.id} className="td num px-3 py-2">
                      {f && res.totals[f.key] != null ? cellText(f, { id: 0, [f.key]: res.totals[f.key] }) : ""}
                    </td>;
                  })}
                </tr>
              </tfoot>
            )}
          </table>
          {res && res.total === 0 && <Empty>Žiadne záznamy</Empty>}
        </div>
        <div className="-mt-px border-t border-slate-200 dark:border-slate-800">{footer}</div>
      </div>

      {/* mobile cards */}
      <div className="space-y-2 md:hidden">
        {res?.rows.map((r) => {
          const main = visibleFields.slice(0, 4);
          return (
            <button key={r.id} type="button" className={`card block w-full p-3 text-left ${r.active === false ? "opacity-60" : ""}`} onClick={() => open(r)}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium">{main[0] ? cellText(main[0], r) || "—" : `#${r.id}`}</div>
                {canSelect && (
                  <input type="checkbox" className="mt-1 accent-brand-600" checked={!!selection[String(r.id)]}
                    aria-label="Označiť riadok" onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setSelection((s) => ({ ...s, [String(r.id)]: e.target.checked }))} />
                )}
              </div>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 text-sm">
                {main.slice(1).map((f) => (
                  <div key={f.key} className="contents">
                    <dt className="text-slate-500">{f.label}</dt>
                    <dd className="text-right">{cellText(f, r)}</dd>
                  </div>
                ))}
              </dl>
            </button>
          );
        })}
        {res && numericVisible.length > 0 && res.total > 0 && (
          <div className="card p-3 text-sm">
            <div className="font-semibold">Spolu ({res.total})</div>
            {numericVisible.map((f) => (
              <div key={f.key} className="flex justify-between"><span className="text-slate-500">{f.label}</span>
                <span className="tabular-nums">{cellText(f, { id: 0, [f.key]: res.totals[f.key] })}</span></div>
            ))}
          </div>
        )}
        {res && res.total === 0 && <Empty>Žiadne záznamy</Empty>}
        <div className="card">{footer}</div>
      </div>

      {drawer && (
        <EntityDrawer meta={meta.data} id={drawer.id} open={!!drawer} onClose={() => setDrawer(null)} defaults={props.createDefaults} />
      )}
      <ViewSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} vk={vk} fields={fields} hasActive={meta.data.has_active}
        cfg={cfg} update={update} views={savedViews} active={activeView} isAdmin={isAdmin} onActive={setActiveView}
        onApply={(v) => {
          setCfg({ ...cfg, ...v.config });
          setQInput(v.config.q ?? "");
          setActiveView(v.id);
          setPage(1);
          setSettingsOpen(false);
        }} />
      <Modal open={!!payloadAction} onClose={() => setPayloadAction(null)} title="Priradiť zákazku"
        footer={<>
          <button className="btn-secondary" onClick={() => setPayloadAction(null)}>Zrušiť</button>
          <button className="btn-primary" disabled={!payloadProject} onClick={() => {
            runAction.mutate({ key: payloadAction!, payload: { project_id: payloadProject } });
            setPayloadAction(null);
          }}>Priradiť</button>
        </>}>
        <label className="label">Zákazka</label>
        <RefSelect entity="projects" value={payloadProject} onChange={(v) => setPayloadProject(v)} />
        <p className="mt-2 text-xs text-slate-500">Celý doklad sa priradí na vybranú zákazku (existujúce rozdelenie sa nahradí).</p>
      </Modal>
    </div>
  );
}

// ----------------------------------------------------------------------------- "Zobrazenie tabuľky"
// One dialog for everything about how the table looks: columns and their order, grouping, inactive records and
// saved views. Columns, grouping and the inactive switch apply immediately; the dialog is closed with "Hotovo".
function ViewSettings({ open, onClose, vk, fields, hasActive, cfg, update, views, active, isAdmin, onApply, onActive }: {
  open: boolean; onClose: () => void; vk: string; fields: FieldMeta[]; hasActive: boolean;
  cfg: ViewConfig; update: (patch: Partial<ViewConfig>) => void;
  views: SavedView[]; active: number | null; isAdmin: boolean;
  onApply: (v: SavedView) => void; onActive: (id: number | null) => void;
}) {
  const [name, setName] = useState("");
  const [asDefault, setAsDefault] = useState(false);
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const asking = useRef(false);
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  // ---- columns
  const cols = cfg.columns ?? [];
  const fmap = new Map(fields.map((f) => [f.key, f]));
  const ordered = [
    ...(cols.map((k) => fmap.get(k)).filter(Boolean) as FieldMeta[]),
    ...fields.filter((f) => !cols.includes(f.key)),
  ];
  const toggle = (k: string, on: boolean) => update({ columns: on ? [...cols.filter((c) => c !== k), k] : cols.filter((c) => c !== k) });
  const move = (k: string, dir: -1 | 1) => {
    const i = cols.indexOf(k);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cols.length) return;
    const c = [...cols];
    [c[i], c[j]] = [c[j], c[i]];
    update({ columns: c });
  };
  const groupable = fields.filter((f) => f.sortable && f.type !== "longtext" && f.type !== "multiref");

  // ---- saved views
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["views", vk] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const save = () => run(async () => {
    const v = await api.post<SavedView>("/api/views", { entity: vk, name: name.trim(), config: cfg, is_default: asDefault, shared });
    toast.ok("Pohľad uložený");
    setName("");
    setAsDefault(false);
    setShared(false);
    if (v?.id != null) onActive(v.id);
  });
  const overwrite = (v: SavedView) => run(async () => {
    await api.patch(`/api/views/${v.id}`, { config: cfg });
    toast.ok("Pohľad aktualizovaný");
    onActive(v.id);
  });
  const toggleDefault = (v: SavedView) => run(async () => {
    await api.patch(`/api/views/${v.id}`, { is_default: !v.is_default });
  });
  const remove = async (v: SavedView) => {
    asking.current = true;
    const ok = await confirm(`Vymazať pohľad „${v.name}“?`, "Vymazať");
    asking.current = false;
    if (!ok) return;
    await run(async () => {
      await api.del(`/api/views/${v.id}`);
      if (active === v.id) onActive(null);
    });
  };

  const heading = "text-sm font-semibold";
  return (
    // Escape pressed in the confirmation dialog must not close this dialog as well
    <Modal open={open} onClose={() => { if (!asking.current) onClose(); }} title="Zobrazenie tabuľky" wide
      footer={<button type="button" className="btn-primary" onClick={onClose}>Hotovo</button>}>
      <div className="space-y-5">
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className={heading}>Stĺpce</h3>
            <button type="button" className="btn-ghost btn-sm" title="Zobraziť predvolenú zostavu stĺpcov"
              onClick={() => update({ columns: fields.filter((f) => f.default_visible).map((f) => f.key) })}>Predvolené stĺpce</button>
          </div>
          <ul className="max-h-60 overflow-y-auto rounded-md border border-slate-200 px-2 py-1 dark:border-slate-800">
            {ordered.map((f) => {
              const i = cols.indexOf(f.key);
              const on = i >= 0;
              return (
                <li key={f.key} className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 text-sm">
                    <input type="checkbox" className="accent-brand-600" checked={on} disabled={on && cols.length === 1}
                      onChange={(e) => toggle(f.key, e.target.checked)} />
                    <span className="truncate">{f.label}</span>
                    {f.computed && <span className="shrink-0 text-xs text-slate-400">(vypočítané)</span>}
                  </label>
                  {on && (
                    <>
                      <button type="button" className="btn-ghost btn-sm px-1.5" disabled={i === 0} onClick={() => move(f.key, -1)}
                        aria-label={`Posunúť stĺpec ${f.label} vyššie`} title="Posunúť vyššie"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button type="button" className="btn-ghost btn-sm px-1.5" disabled={i === cols.length - 1} onClick={() => move(f.key, 1)}
                        aria-label={`Posunúť stĺpec ${f.label} nižšie`} title="Posunúť nižšie"><ArrowDown className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-xs text-slate-500">
            Poradie zmeníte šípkami alebo potiahnutím hlavičky stĺpca priamo v tabuľke. Šírku stĺpca upravíte ťahaním jeho pravého okraja.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`dt-group-${vk}`}>Zoskupiť podľa</label>
            <select id={`dt-group-${vk}`} className="input" value={cfg.groupBy ?? ""} onChange={(e) => update({ groupBy: e.target.value || null })}>
              <option value="">Nezoskupovať</option>
              {groupable.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          {hasActive && (
            <div>
              <span className="label">Neaktívne záznamy</span>
              <label className="flex cursor-pointer items-center gap-2 py-1.5 text-sm">
                <input type="checkbox" className="accent-brand-600" checked={!!cfg.includeInactive}
                  onChange={(e) => update({ includeInactive: e.target.checked })} />
                zobraziť aj neaktívne
              </label>
            </div>
          )}
        </section>

        <section>
          <h3 className={`mb-2 ${heading}`}>Uložené pohľady</h3>
          {views.length === 0 ? (
            <p className="text-sm text-slate-500">Zatiaľ žiadne. Pohľad si zapamätá stĺpce, triedenie, filtre a zoskupenie.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {views.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-x-1 gap-y-0.5 py-1.5 text-sm">
                  <button type="button" className={`flex min-w-[10rem] flex-1 items-center gap-1.5 text-left hover:underline ${v.id === active ? "font-semibold" : ""}`}
                    title="Použiť tento pohľad" onClick={() => onApply(v)}>
                    {v.id === active && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />}
                    <span>
                      {v.name}
                      {v.is_default && <span className="ml-1 text-xs font-normal text-amber-600">(predvolený)</span>}
                      {v.shared && <span className="ml-1 text-xs font-normal text-brand-600">(zdieľaný)</span>}
                    </span>
                  </button>
                  {v.own && (
                    <>
                      <button type="button" className="btn-ghost btn-sm" disabled={busy} title="Prepísať aktuálnym nastavením tabuľky"
                        onClick={() => void overwrite(v)}>Prepísať</button>
                      <button type="button" className="btn-ghost btn-sm" disabled={busy}
                        onClick={() => void toggleDefault(v)}>{v.is_default ? "Zrušiť predvolený" : "Predvolený"}</button>
                      <button type="button" className="btn-ghost btn-sm text-red-600" disabled={busy}
                        onClick={() => void remove(v)}>Vymazať</button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 space-y-2 rounded-md bg-slate-50 p-3 dark:bg-slate-800/50">
            <label className="label" htmlFor={`dt-view-name-${vk}`}>Uložiť aktuálne nastavenie (stĺpce, triedenie, filtre, zoskupenie) ako nový pohľad</label>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <input id={`dt-view-name-${vk}`} className="input min-w-[12rem] flex-1" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Názov nového pohľadu, napr. Sikorky – materiál"
                onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && !busy) void save(); }} />
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="accent-brand-600" checked={asDefault} onChange={(e) => setAsDefault(e.target.checked)} /> predvolený
              </label>
              {isAdmin && (
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" className="accent-brand-600" checked={shared} onChange={(e) => setShared(e.target.checked)} /> zdieľať všetkým
                </label>
              )}
              <button type="button" className="btn-primary btn-sm" disabled={!name.trim() || busy} onClick={() => void save()}>Uložiť pohľad</button>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}
