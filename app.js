/*
 * Eye Movement R² Calculator — browser logic.
 *
 * Same verified algorithm as the reference workflow:
 *   R² = (Pearson correlation of eye position vs. Time)²,
 *   computed on the LH and RH channels only (LV/RV unused),
 *   for both horizontal and vertical saccade files.
 *
 * Everything runs client-side. No server, no upload leaves the machine.
 */

const TEMPLATE_URL =
  "https://docs.google.com/spreadsheets/d/1IQTNE3Myjq02l14CmzQXs7IanzrO20VaoszoD1NyKes/edit?usp=sharing";

const EYES = ["LH", "RH"];
const DIRECTIONS = ["Horizontal", "Vertical"];
const FREQUENCIES = ["0.5", "0.75", "1"];
const REQUIRED_COLUMNS = ["Time(sec)", "LH", "RH"];

// ---------------------------------------------------------------------------
// Filename / patient parsing
// ---------------------------------------------------------------------------

function baseName(name) {
  return name.replace(/\\/g, "/").split("/").pop();
}

function parsePatient(name) {
  let base = baseName(name).replace(/\.(zip|csv)$/i, "");
  // Cut everything from 'VOG' onward; the patient name is the prefix.
  let head = base.split(/VOG/i)[0];
  head = head.replace(/MG\s*$/i, "");        // drop trailing 'MG' marker
  head = head.replace(/^[\s_\-\t]+|[\s_\-\t]+$/g, ""); // strip separators
  head = head.replace(/^\d{4}-\d{2}-\d{2}\s+/, ""); // drop leading date
  return head.trim();
}

function parseCategory(name) {
  const base = baseName(name);
  let direction;
  if (/horizontal/i.test(base)) direction = "Horizontal";
  else if (/vertical/i.test(base)) direction = "Vertical";
  else return null;

  const freqMatch = base.match(/(\d+(?:\.\d+)?)\s*Hz/i);
  if (!freqMatch) return null;
  const frequency = freqMatch[1];

  const typeMatch = base.match(/Saccade\s+([BR])\b/i);
  const type = typeMatch ? typeMatch[1].toUpperCase() : "B";

  const label = `${direction} ${frequency}Hz ${type}`;
  return { direction, frequency, type, label };
}

// ---------------------------------------------------------------------------
// CSV reading + R²
// ---------------------------------------------------------------------------

class InvalidCsvError extends Error {}

/** Decode UTF-16LE bytes into {Time(sec):[], LH:[], RH:[], ...}. */
function readChannels(bytes) {
  let text;
  try {
    text = new TextDecoder("utf-16le", { fatal: false }).decode(bytes);
  } catch (e) {
    text = new TextDecoder("utf-8").decode(bytes);
  }

  const lines = text.split(/\r?\n/);
  if (lines.length === 0) throw new InvalidCsvError("File is empty.");

  const header = lines[0].split(",").map((h) => h.trim());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) {
    throw new InvalidCsvError(
      `Missing required column(s): ${missing.join(", ")}. Found: ${header.join(", ")}`
    );
  }

  const idx = {};
  header.forEach((c, i) => (idx[c] = i));
  const cols = {};
  header.forEach((c) => (cols[c] = []));

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || raw.trim() === "") continue;
    const parts = raw.split(",");
    for (const c of header) {
      const v = parseFloat((parts[idx[c]] ?? "").trim());
      cols[c].push(Number.isFinite(v) ? v : NaN);
    }
  }
  return cols;
}

/** R² = squared Pearson correlation; NaN if <2 valid points or no variance. */
function rSquared(x, y) {
  let n = 0, sx = 0, sy = 0;
  for (let i = 0; i < x.length; i++) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) {
      n++; sx += x[i]; sy += y[i];
    }
  }
  if (n < 2) return NaN;
  const mx = sx / n, my = sy / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) {
      const dx = x[i] - mx, dy = y[i] - my;
      sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
  }
  if (sxx === 0 || syy === 0) return NaN;
  const r = sxy / Math.sqrt(sxx * syy);
  return r * r;
}

function computeFileR2(bytes) {
  const ch = readChannels(bytes);
  const t = ch["Time(sec)"];
  const out = {};
  for (const eye of EYES) out[eye] = rSquared(t, ch[eye]);
  return out;
}

// ---------------------------------------------------------------------------
// Batch processing (csv + zip)
// ---------------------------------------------------------------------------

/** Best-effort decode of a zip entry name (UTF-8, else Korean cp949/euc-kr). */
function decodeZipName(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (e) {
    try {
      return new TextDecoder("euc-kr").decode(bytes);
    } catch (e2) {
      return new TextDecoder("utf-8").decode(bytes);
    }
  }
}

/** files: [{name, buffer(ArrayBuffer)}]. Returns {results, warnings}. */
async function processUploads(files) {
  const results = [];
  const warnings = [];

  const handleCsv = (name, patientSource, u8) => {
    const category = parseCategory(name);
    if (!category) {
      warnings.push(`Skipped "${name}": could not read direction/frequency from name.`);
      return;
    }
    try {
      const r2 = computeFileR2(u8);
      results.push({ patient: parsePatient(patientSource), category, r2 });
    } catch (err) {
      warnings.push(`Skipped "${name}": ${err.message}`);
    }
  };

  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith(".zip")) {
      let zip;
      try {
        zip = await JSZip.loadAsync(f.buffer, { decodeFileName: decodeZipName });
      } catch (e) {
        warnings.push(`Skipped "${f.name}": not a valid .zip file.`);
        continue;
      }
      const entries = Object.values(zip.files).filter(
        (e) => !e.dir && e.name.toLowerCase().endsWith(".csv")
      );
      if (entries.length === 0) {
        warnings.push(`Skipped "${f.name}": zip contained no .csv files.`);
      }
      for (const entry of entries) {
        const u8 = await entry.async("uint8array");
        const patientSource = entry.name.includes("/") ? entry.name : f.name;
        handleCsv(entry.name, patientSource, u8);
      }
    } else if (lower.endsWith(".csv")) {
      handleCsv(f.name, f.name, new Uint8Array(f.buffer));
    } else {
      warnings.push(`Skipped "${f.name}": unsupported file type (need .csv or .zip).`);
    }
  }
  return { results, warnings };
}

// ---------------------------------------------------------------------------
// Table building
// ---------------------------------------------------------------------------

function categorySortKey(c) {
  return [
    c.type === "B" ? 0 : 1,
    DIRECTIONS.indexOf(c.direction) >= 0 ? DIRECTIONS.indexOf(c.direction) : 99,
    FREQUENCIES.indexOf(c.frequency) >= 0 ? FREQUENCIES.indexOf(c.frequency) : 99,
  ];
}

/** Returns {columns, redColumns, patients, rows:[{patient,eye,values:{label:v}}]}. */
function buildTable(results) {
  const cats = new Map();
  for (const r of results) cats.set(r.category.label, r.category);
  const ordered = [...cats.values()].sort((a, b) => {
    const ka = categorySortKey(a), kb = categorySortKey(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  });
  const columns = ordered.map((c) => c.label);
  const redColumns = ordered.filter((c) => c.type === "R").map((c) => c.label);

  const patients = [];
  for (const r of results) if (!patients.includes(r.patient)) patients.push(r.patient);

  const cells = new Map(); // key `${patient}||${eye}` -> {label: value}
  for (const r of results) {
    for (const eye of EYES) {
      const key = `${r.patient}||${eye}`;
      if (!cells.has(key)) cells.set(key, {});
      cells.get(key)[r.category.label] = r.r2[eye];
    }
  }

  const rows = [];
  for (const patient of patients) {
    for (const eye of EYES) {
      const values = cells.get(`${patient}||${eye}`) || {};
      rows.push({ patient, eye, values });
    }
  }
  return { columns, redColumns, patients, rows };
}

// ---------------------------------------------------------------------------
// Excel export (ExcelJS, styled)
// ---------------------------------------------------------------------------

async function toExcelBlob(table) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("R^2 values");
  const headers = ["Patient", "Eye", ...table.columns];

  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell, col) => {
    const name = headers[col - 1];
    const isRed = table.redColumns.includes(name);
    cell.font = { bold: true, color: { argb: isRed ? "FFFF0000" : "FF000000" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
    cell.alignment = { horizontal: "center" };
  });

  for (const row of table.rows) {
    const values = [row.patient, row.eye];
    for (const label of table.columns) {
      const v = row.values[label];
      values.push(Number.isFinite(v) ? v : null);
    }
    const r = ws.addRow(values);
    for (let i = 3; i <= headers.length; i++) r.getCell(i).numFmt = "0.0000";
  }

  headers.forEach((name, i) => {
    ws.getColumn(i + 1).width = Math.max(name.length, 10) + 2;
  });
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------

const els = {};
let lastTable = null;

function fmt(v) {
  return Number.isFinite(v) ? v.toFixed(4) : "";
}

function renderTable(table) {
  const headers = ["Patient", "Eye", ...table.columns];
  let html = "<table><thead><tr>";
  for (const h of headers) {
    const red = table.redColumns.includes(h) ? ' class="red"' : "";
    html += `<th${red}>${h}</th>`;
  }
  html += "</tr></thead><tbody>";
  for (const row of table.rows) {
    html += "<tr>";
    html += `<td class="patient">${row.patient}</td><td>${row.eye}</td>`;
    for (const label of table.columns) {
      const red = table.redColumns.includes(label) ? ' class="red"' : "";
      html += `<td${red}>${fmt(row.values[label])}</td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table>";
  els.results.innerHTML = html;
}

function showWarnings(warnings) {
  if (!warnings.length) {
    els.warnings.innerHTML = "";
    return;
  }
  els.warnings.innerHTML = warnings
    .map((w) => `<div class="warn">⚠️ ${w}</div>`)
    .join("");
}

async function handleFiles(fileList) {
  const files = [];
  for (const f of fileList) {
    files.push({ name: f.name, buffer: await f.arrayBuffer() });
  }
  els.status.textContent = "Processing…";
  const { results, warnings } = await processUploads(files);
  showWarnings(warnings);

  if (results.length === 0) {
    els.status.innerHTML =
      '<span class="error">No valid recordings found. Check the file format.</span>';
    els.results.innerHTML = "";
    els.download.disabled = true;
    lastTable = null;
    return;
  }

  const table = buildTable(results);
  lastTable = table;
  const nPatients = table.patients.length;
  els.status.innerHTML =
    `<span class="ok">Processed ${results.length} recording(s) across ${nPatients} patient(s).</span>`;
  renderTable(table);
  els.download.disabled = false;
  els.redNote.style.display = table.redColumns.length ? "block" : "none";
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function downloadExcel() {
  if (!lastTable) return;
  const blob = await toExcelBlob(lastTable);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `R_values_${stamp()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

window.addEventListener("DOMContentLoaded", () => {
  els.input = document.getElementById("fileInput");
  els.drop = document.getElementById("dropZone");
  els.results = document.getElementById("results");
  els.warnings = document.getElementById("warnings");
  els.status = document.getElementById("status");
  els.download = document.getElementById("downloadBtn");
  els.redNote = document.getElementById("redNote");
  document.getElementById("templateLink").href = TEMPLATE_URL;

  els.input.addEventListener("change", (e) => handleFiles(e.target.files));
  els.download.addEventListener("click", downloadExcel);

  ["dragenter", "dragover"].forEach((ev) =>
    els.drop.addEventListener(ev, (e) => {
      e.preventDefault();
      els.drop.classList.add("hover");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    els.drop.addEventListener(ev, (e) => {
      e.preventDefault();
      els.drop.classList.remove("hover");
    })
  );
  els.drop.addEventListener("drop", (e) => {
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });
  els.drop.addEventListener("click", () => els.input.click());
});
