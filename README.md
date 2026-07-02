# Eye Movement R² Calculator (web app)

A pure browser app — **no install, no server, no Python**. All computation runs
client-side; uploaded files never leave the machine.

## How to use
- **Just open `index.html`** in a browser (double-click it), **or** host the
  `web/` folder on any static host (GitHub Pages, Netlify, an internal share).
- Drag in `.csv` files **or** a `.zip` of them → the table appears → click
  **Download Excel spreadsheet**.

## What it computes
- `R² = (Pearson correlation of eye position vs. Time)²`, on the **LH** and
  **RH** channels only, for both horizontal and vertical files. This matches the
  `answer_key.xlsx` workflow.
- Category (Horizontal/Vertical, frequency, B/R) and patient name are read from
  the file names. **R-type** columns are shown/exported in **red**.
- Missing categories are left blank.

## Files
| File | Purpose |
|------|---------|
| `index.html` | The page. |
| `app.js` | All logic: CSV/zip parsing, R² math, table, Excel export. |
| `styles.css` | Styling. |
| `vendor/jszip.min.js` | Reads `.zip` uploads (bundled for offline use). |
| `vendor/exceljs.min.js` | Writes styled `.xlsx` (bundled for offline use). |

## Notes
- Works offline (both libraries are vendored locally, not from a CDN).
- Handles the UTF-16 CSV encoding and Korean filenames inside zips automatically.
- To publish for coworkers with a shareable link, push the `web/` folder to a
  GitHub repo and enable GitHub Pages.
