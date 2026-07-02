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

// Significant figures used by answer_key.xlsx (e.g. 0.02551, 0.3441, 0.4146).
const SIG_FIGS = 4;
// Number format applied to Excel cells; mirrors answer_key.xlsx.
const EXCEL_NUM_FMT = "0.0000000";

// ---------------------------------------------------------------------------
// Internationalization (English / Korean)
// ---------------------------------------------------------------------------

const I18N = {
  en: {
    langButton: "한국어",            // click to switch TO Korean
    title: "👁️ Eye Movement R² Calculator",
    subtitle:
      "Upload eye-tracking recordings and download a spreadsheet of " +
      "<strong>R² values</strong> (how strongly each eye's position correlates " +
      "with time) for every category. Everything runs in your browser — nothing " +
      "is uploaded to a server.",
    infoSummary: "ℹ️ How to use / required data format",
    step1:
      'Your files must match the column format in this template: ' +
      '<a id="templateLink" href="#" target="_blank" rel="noopener">Example Google Sheet</a>.',
    step2:
      "Each recording is a <code>.csv</code> with columns " +
      "<code>Time(sec), LH, RH, LV, RV, TargetH, TargetV</code>.",
    step3:
      "Upload the individual <code>.csv</code> files <strong>or</strong> a " +
      "<code>.zip</code> containing them (one zip per patient works well).",
    step4:
      "Patient name and category (Horizontal/Vertical, frequency, B/R) are " +
      "read automatically from the file names — keep the original names.",
    warning:
      "⚠️ The calculator will not work if the files are not in the correct " +
      "format. Only the <strong>LH</strong> and <strong>RH</strong> channels are " +
      "used (this matches the reference sheet).",
    dropTitle:
      "<strong>Drag &amp; drop</strong> your <code>.csv</code> or " +
      "<code>.zip</code> files here",
    dropSub: "or click to browse",
    downloadBtn: "⬇️ Download Excel spreadsheet",
    redNote: "🔴 Red columns are <strong>R-type</strong> categories.",
    colPatient: "Patient",
    colEye: "Eye",
    dirHorizontal: "Horizontal",
    dirVertical: "Vertical",
    statusProcessing: "Processing…",
    statusProcessed: (n, p) =>
      `Processed ${n} recording(s) across ${p} patient(s).`,
    statusNoValid: "No valid recordings found. Check the file format.",
    warnBadDir: (name) =>
      `Skipped "${name}": could not read direction/frequency from name.`,
    warnInvalid: (name, msg) => `Skipped "${name}": ${msg}`,
    warnBadZip: (name) => `Skipped "${name}": not a valid .zip file.`,
    warnNoCsv: (name) => `Skipped "${name}": zip contained no .csv files.`,
    warnUnsupported: (name) =>
      `Skipped "${name}": unsupported file type (need .csv or .zip).`,
  },
  ko: {
    langButton: "English",           // click to switch TO English
    title: "👁️ 안구 운동 R² 계산기",
    subtitle:
      "안구 추적 기록을 업로드하면 각 카테고리의 <strong>R² 값</strong>" +
      "(각 눈의 위치가 시간과 얼마나 상관되는지)을 계산한 스프레드시트를 " +
      "다운로드할 수 있습니다. 모든 계산은 브라우저에서 실행되며 서버로 전송되지 않습니다.",
    infoSummary: "ℹ️ 사용 방법 / 필수 데이터 형식",
    step1:
      "파일은 이 템플릿의 열 형식과 일치해야 합니다: " +
      '<a id="templateLink" href="#" target="_blank" rel="noopener">예시 Google 시트</a>.',
    step2:
      "각 기록은 <code>Time(sec), LH, RH, LV, RV, TargetH, TargetV</code> " +
      "열을 가진 <code>.csv</code> 파일입니다.",
    step3:
      "개별 <code>.csv</code> 파일 <strong>또는</strong> 이를 담은 " +
      "<code>.zip</code> 파일을 업로드하세요 (환자당 zip 하나가 편리합니다).",
    step4:
      "환자 이름과 카테고리(수평/수직, 주파수, B/R)는 파일 이름에서 " +
      "자동으로 읽습니다 — 원래 파일 이름을 유지하세요.",
    warning:
      "⚠️ 파일이 올바른 형식이 아니면 계산기가 작동하지 않습니다. " +
      "<strong>LH</strong>와 <strong>RH</strong> 채널만 사용됩니다 (참조 시트와 동일).",
    dropTitle:
      "<strong>드래그 앤 드롭</strong>으로 <code>.csv</code> 또는 " +
      "<code>.zip</code> 파일을 여기에 놓으세요",
    dropSub: "또는 클릭하여 파일 선택",
    downloadBtn: "⬇️ Excel 스프레드시트 다운로드",
    redNote: "🔴 빨간색 열은 <strong>R 유형</strong> 카테고리입니다.",
    colPatient: "환자",
    colEye: "눈",
    dirHorizontal: "수평",
    dirVertical: "수직",
    statusProcessing: "처리 중…",
    statusProcessed: (n, p) => `${n}개의 기록을 ${p}명의 환자에 대해 처리했습니다.`,
    statusNoValid: "유효한 기록을 찾을 수 없습니다. 파일 형식을 확인하세요.",
    warnBadDir: (name) =>
      `"${name}" 건너뜀: 파일 이름에서 방향/주파수를 읽을 수 없습니다.`,
    warnInvalid: (name, msg) => `"${name}" 건너뜀: ${msg}`,
    warnBadZip: (name) => `"${name}" 건너뜀: 올바른 .zip 파일이 아닙니다.`,
    warnNoCsv: (name) => `"${name}" 건너뜀: zip에 .csv 파일이 없습니다.`,
    warnUnsupported: (name) =>
      `"${name}" 건너뜀: 지원되지 않는 파일 형식입니다 (.csv 또는 .zip 필요).`,
  },
};

let currentLang = "en";

function t(key) {
  return I18N[currentLang][key];
}

/** Translate a category label ("Horizontal 0.5Hz B") for display. */
function categoryLabelDisplay(label) {
  if (currentLang === "ko") {
    return label
      .replace(/^Horizontal/, I18N.ko.dirHorizontal)
      .replace(/^Vertical/, I18N.ko.dirVertical);
  }
  return label;
}

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

/*
 * Warnings are stored as { fn, args } so they can be rendered in whichever
 * language is active when they are shown, e.g. { fn: "warnBadZip", args: [name] }.
 */
function warn(list, fn, ...args) {
  list.push({ fn, args });
}

/** files: [{name, buffer(ArrayBuffer)}]. Returns {results, warnings}. */
async function processUploads(files) {
  const results = [];
  const warnings = [];

  const handleCsv = (name, patientSource, u8) => {
    const category = parseCategory(name);
    if (!category) {
      warn(warnings, "warnBadDir", name);
      return;
    }
    try {
      const r2 = computeFileR2(u8);
      results.push({ patient: parsePatient(patientSource), category, r2 });
    } catch (err) {
      warn(warnings, "warnInvalid", name, err.message);
    }
  };

  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith(".zip")) {
      if (typeof JSZip === "undefined") {
        warn(warnings, "warnBadZip", f.name);
        continue;
      }
      let zip;
      try {
        zip = await JSZip.loadAsync(f.buffer, { decodeFileName: decodeZipName });
      } catch (e) {
        warn(warnings, "warnBadZip", f.name);
        continue;
      }
      const entries = Object.values(zip.files).filter(
        (e) => !e.dir && e.name.toLowerCase().endsWith(".csv")
      );
      if (entries.length === 0) {
        warn(warnings, "warnNoCsv", f.name);
      }
      for (const entry of entries) {
        const u8 = await entry.async("uint8array");
        const patientSource = entry.name.includes("/") ? entry.name : f.name;
        handleCsv(entry.name, patientSource, u8);
      }
    } else if (lower.endsWith(".csv")) {
      handleCsv(f.name, f.name, new Uint8Array(f.buffer));
    } else {
      warn(warnings, "warnUnsupported", f.name);
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
// Number formatting (match answer_key: 4 significant figures)
// ---------------------------------------------------------------------------

/** On-screen string, e.g. 0.0255086 -> "0.02551", 0.0001801 -> "0.0001801". */
function fmt(v) {
  return Number.isFinite(v) ? v.toPrecision(SIG_FIGS) : "";
}

/** Numeric value rounded to the answer-key precision, for Excel cells. */
function roundR(v) {
  return Number.isFinite(v) ? Number(v.toPrecision(SIG_FIGS)) : null;
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
    for (const label of table.columns) values.push(roundR(row.values[label]));
    const r = ws.addRow(values);
    for (let i = 3; i <= headers.length; i++) r.getCell(i).numFmt = EXCEL_NUM_FMT;
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
let lastWarnings = [];
let statusState = null; // {type:'processing'} | {type:'processed', n, p} | {type:'noValid'}

function renderTable(table) {
  if (!table) {
    els.results.innerHTML = "";
    return;
  }
  const headers = [t("colPatient"), t("colEye"), ...table.columns.map(categoryLabelDisplay)];
  const redSet = new Set(table.redColumns.map(categoryLabelDisplay));
  let html = "<table><thead><tr>";
  for (const h of headers) {
    const red = redSet.has(h) ? ' class="red"' : "";
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

function renderWarnings(warnings) {
  lastWarnings = warnings;
  els.warnings.innerHTML = warnings
    .map((w) => `<div class="warn">⚠️ ${t(w.fn)(...w.args)}</div>`)
    .join("");
}

function renderStatus() {
  const s = statusState;
  if (!s) {
    els.status.innerHTML = "";
  } else if (s.type === "processing") {
    els.status.innerHTML = t("statusProcessing");
  } else if (s.type === "processed") {
    els.status.innerHTML = `<span class="ok">${t("statusProcessed")(s.n, s.p)}</span>`;
  } else if (s.type === "noValid") {
    els.status.innerHTML = `<span class="error">${t("statusNoValid")}</span>`;
  }
}

function setStatus(state) {
  statusState = state;
  renderStatus();
}

async function handleFiles(fileList) {
  const files = [];
  for (const f of fileList) {
    files.push({ name: f.name, buffer: await f.arrayBuffer() });
  }
  setStatus({ type: "processing" });
  const { results, warnings } = await processUploads(files);
  renderWarnings(warnings);

  if (results.length === 0) {
    setStatus({ type: "noValid" });
    lastTable = null;
    renderTable(null);
    els.download.disabled = true;
    els.redNote.style.display = "none";
    return;
  }

  const table = buildTable(results);
  lastTable = table;
  setStatus({ type: "processed", n: results.length, p: table.patients.length });
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

// ---- Language handling ----

function applyTranslations() {
  document.documentElement.lang = currentLang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  // The template link lives inside a translated <li>, so re-bind it each time.
  const link = document.getElementById("templateLink");
  if (link) link.href = TEMPLATE_URL;
  els.langToggle.textContent = t("langButton");

  // Re-render dynamic parts that are already on screen.
  renderStatus();
  renderWarnings(lastWarnings);
  renderTable(lastTable);
}

function setLang(lang) {
  currentLang = lang;
  applyTranslations();
}

window.addEventListener("DOMContentLoaded", () => {
  els.input = document.getElementById("fileInput");
  els.drop = document.getElementById("dropZone");
  els.results = document.getElementById("results");
  els.warnings = document.getElementById("warnings");
  els.status = document.getElementById("status");
  els.download = document.getElementById("downloadBtn");
  els.redNote = document.getElementById("redNote");
  els.langToggle = document.getElementById("langToggle");

  applyTranslations();

  els.langToggle.addEventListener("click", () =>
    setLang(currentLang === "en" ? "ko" : "en")
  );
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
