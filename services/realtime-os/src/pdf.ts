import puppeteer from "puppeteer";
import { checksum } from "./security.js";
import { config } from "./config.js";

export type PdfInput = {
  propertyName: string;
  reportTitle: string;
  generatedBy: string;
  from: string;
  to: string;
  columns: string[];
  rows: Record<string, unknown>[];
};

function html(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export async function renderReportPdf(input: PdfInput) {
  const trackingId = `WGSL-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const signature = checksum(JSON.stringify({ trackingId, ...input }));
  const markup = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page{size:Letter;margin:.75in .45in}*{box-sizing:border-box}body{font-family:Inter,Helvetica,Arial,sans-serif;color:#172033;font-size:9px}
  header{padding:18px;background:#1A365D;color:white;display:flex;justify-content:space-between}h1{margin:0;font-size:19px}.meta{text-align:right;line-height:1.5}
  .period{margin:16px 0;padding:11px;border:1px solid #CBD5E0;background:#F7FAFC}table{width:100%;border-collapse:collapse}thead{display:table-header-group}
  th{padding:7px;border:1px solid #CBD5E0;background:#F7FAFC;color:#1A365D;text-align:left;text-transform:uppercase}td{padding:7px;border:1px solid #D9E2EC}
  tr{break-inside:avoid;page-break-inside:avoid}footer{margin-top:14px;padding-top:8px;border-top:1px solid #CBD5E0;font-family:monospace;font-size:7px;word-break:break-all}
  </style></head><body><header><div><h1>${html(input.propertyName)}</h1><span>${html(input.reportTitle)}</span></div><div class="meta">${trackingId}<br>${html(input.generatedBy)}<br>${new Date().toISOString()}</div></header>
  <div class="period"><b>Reporting period:</b> ${html(input.from)} — ${html(input.to)}</div>
  <table><thead><tr>${input.columns.map((column) => `<th>${html(column)}</th>`).join("")}</tr></thead><tbody>${input.rows.map((row) => `<tr>${input.columns.map((column) => `<td>${html(row[column])}</td>`).join("")}</tr>`).join("")}</tbody></table>
  <footer>Immutable SHA-256 signature: ${signature}</footer></body></html>`;
  const browser = await puppeteer.launch({
    headless: true,
    ...(config.CHROMIUM_EXECUTABLE_PATH ? { executablePath: config.CHROMIUM_EXECUTABLE_PATH } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(markup, { waitUntil: "domcontentloaded" });
    return await page.pdf({
      format: "Letter", printBackground: true,
      displayHeaderFooter: true, headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;font-size:8px;text-align:center;color:#4A5568">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
      margin: { top: "0.5in", bottom: "0.6in", left: "0.45in", right: "0.45in" },
    });
  } finally { await browser.close(); }
}
