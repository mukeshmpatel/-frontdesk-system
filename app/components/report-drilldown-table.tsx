"use client";
import { useMemo, useState } from "react";

export type SummaryMetric = {
  id: string;
  label: string;
  value: number;
  unit: string;
  trend: "UP" | "DOWN" | "FLAT";
  recordCount: number;
  priorValue: number | null;
  change: number | null;
  changePercent: number | null;
  drillDown: { metricId: string; propertyId: string; from: string; to: string; department: string | null };
};

export type DrilldownRecord = Record<string, unknown>;

export default function ReportDrilldownTable({
  metrics, activeMetric, records, loading, onOpen, onExport,
}: {
  metrics: SummaryMetric[];
  activeMetric: string;
  records: DrilldownRecord[];
  loading: boolean;
  onOpen: (metric: SummaryMetric) => void;
  onExport?: (metricId: string, rowCount: number) => boolean | Promise<boolean>;
}) {
  const [statusFilter,setStatusFilter]=useState("ALL");
  const active = metrics.find((metric) => metric.id === activeMetric);
  const statuses=useMemo(()=>[...new Set(records.map(record=>String(record.status??"")).filter(Boolean))],[records]);
  const filtered=statusFilter==="ALL"?records:records.filter(record=>String(record.status)===statusFilter);
  const columns = filtered.length ? Object.keys(filtered[0]).filter((column) => column !== "id") : [];
  async function exportCsv(){
    if (onExport && await onExport(active?.id ?? "drilldown", filtered.length)) return;
    const safe=(value:unknown)=>`"${String(value??"").replace(/"/g,'""')}"`;
    const csv=[columns.map(safe).join(","),...filtered.map(row=>columns.map(column=>safe(row[column])).join(","))].join("\n");
    const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));link.download=`AAIQ-${active?.id??"drilldown"}.csv`;link.click();URL.revokeObjectURL(link.href);
  }
  return (
    <section className="drilldown-dashboard" aria-label="Interactive report summary">
      <div className="drilldown-metrics">
        {metrics.map((metric) => (
          <button key={metric.id} type="button" className={activeMetric === metric.id ? "active" : ""} onClick={() => onOpen(metric)}>
            <span>{metric.label}</span><strong>{metric.value.toLocaleString("en-US")} <small>{metric.unit}</small></strong>
            <em>View {metric.recordCount.toLocaleString("en-US")} underlying record{metric.recordCount === 1 ? "" : "s"} →</em>
          </button>
        ))}
      </div>
      {active && (
        <div className="inline-drilldown">
          <header><div><p>Transactional drill-down</p><h3>{active.label}</h3></div><div className="drilldown-tools">{statuses.length>0&&<select value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option>ALL</option>{statuses.map(status=><option key={status}>{status}</option>)}</select>}<button disabled={!filtered.length} onClick={()=>void exportCsv()}>Export CSV</button><span>{filtered.length} records</span></div></header>
          {loading ? <div className="drilldown-empty">Loading exact source records…</div>
            : filtered.length ? <div className="drilldown-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column.replace(/([A-Z])/g, " $1")}</th>)}</tr></thead><tbody>{filtered.map((record, index) => <tr key={String(record.id ?? index)}>{columns.map((column) => <td key={column}>{String(record[column] ?? "—")}</td>)}</tr>)}</tbody></table></div>
              : <div className="drilldown-empty">No underlying records matched this metric and period.</div>}
        </div>
      )}
    </section>
  );
}
