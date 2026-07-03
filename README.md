# Eye Movement Calculators (web app)

Two linked browser calculators — **no install, no server, no Python**. All
computation runs client-side; uploaded files never leave the machine.

- **`index.html`** — **R²** calculator: `R² = (Pearson correlation of eye
  position vs. Time)²`. Also shows a table normalized by Vertical 0.75Hz (L+R).
- **`slope.html`** — **Slope (m)** calculator: the slope `m` of the best-fit
  line `y = mx + b` (eye position vs. Time).

A button in the top-right switches between the two pages; a button in the
top-left toggles English / Korean.

## How to use
- **Open `index.html`** (double-click), **or** host this folder on any static
  host (GitHub Pages, Netlify, an internal share).
- Drag in `.csv` files **or** a `.zip` of them → the table appears → click
  **Download Excel spreadsheet**.

## Shared behaviour
- Uses the **LH** and **RH** channels only, for both horizontal and vertical
  files. Values are shown to 4 significant figures (matching `answer_key.xlsx`).
- Category (Horizontal/Vertical, frequency, B/R) and patient name are read from
  the file names. **R-type** columns are shown/exported in **red**.
- Patients are ordered by folder name (matching the file-explorer order).
- Missing categories are left blank.

## Files
| File | Purpose |
|------|---------|
| `index.html` | R² page (config + markup). |
| `slope.html` | Slope (m) page (config + markup). |
| `core.js` | Shared engine: CSV/zip parsing, math, tables, i18n, Excel export. |
| `styles.css` | Styling. |
| `vendor/jszip.min.js` | Reads `.zip` uploads (bundled for offline use). |
| `vendor/exceljs.min.js` | Writes styled `.xlsx` (bundled for offline use). |

Each page sets a small `window.APP` config (which metric, labels, nav target)
before loading `core.js`, so both sites share one codebase.

## Notes
- Works offline (both libraries are vendored locally, with a CDN fallback).
- Handles the UTF-16 CSV encoding and Korean filenames inside zips automatically.
- After updating, bump the `?v=` number on the `core.js` / `styles.css` links so
  browsers fetch the new files instead of a cached copy.
