const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const DEVELOPER_FOOTER_TEXT = 'Developed by SHOUKAT | 03348004300 | devzore.com';
const DEVELOPER_WEBSITE_URL = 'https://devzore.com';

const LOGO_PATHS = [
  path.join(__dirname, '../assets/logo-compact.png'),
  path.join(__dirname, '../assets/logo.png'),
  path.join(__dirname, '../assets/logo-optimized.png'),
];

function getLogoPath() {
  for (const p of LOGO_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Stream a generic worksheet of rows to the response as .xlsx.
 * columns: [{ header, key, width, format }]
 */
async function generateExcel(res, { filename, sheetName, columns, rows }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName || 'Sheet1');

  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 20 }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

  rows.forEach((row) => {
    const values = {};
    columns.forEach((c) => {
      const raw = typeof c.dataKey === 'function' ? c.dataKey(row) : row[c.dataKey || c.key];
      values[c.key] = c.format ? c.format(raw, row) : raw;
    });
    sheet.addRow(values);
  });

  // Printed-page footer (shows when the sheet is printed/exported to PDF from Excel).
  sheet.headerFooter.oddFooter = `&C${DEVELOPER_FOOTER_TEXT}`;
  sheet.headerFooter.evenFooter = `&C${DEVELOPER_FOOTER_TEXT}`;

  // Embed DJ Aljanat logo into the worksheet
  const logoPath = getLogoPath();
  if (logoPath) {
    try {
      const imageId = workbook.addImage({
        filename: logoPath,
        extension: 'png',
      });
      const colPlacement = Math.max(columns.length, 2);
      sheet.addImage(imageId, {
        tl: { col: colPlacement - 0.95, row: 0.05 },
        ext: { width: 44, height: 44 },
      });
    } catch {
      // Continue gracefully if image cannot be embedded
    }
  }

  // Also add a visible caption row below the data (separated by a blank row) so the
  // branding is visible on-screen too, not just on a printed page. Kept clearly
  // separate from the data block so it doesn't corrupt the actual report data.
  sheet.addRow([]);
  const brandRow = sheet.addRow([DEVELOPER_FOOTER_TEXT]);
  const brandCell = brandRow.getCell(1);
  brandCell.value = {
    text: DEVELOPER_FOOTER_TEXT,
    hyperlink: DEVELOPER_WEBSITE_URL,
    tooltip: DEVELOPER_WEBSITE_URL,
  };
  brandCell.font = { italic: true, size: 9, color: { argb: 'FF4F46E5' }, underline: false };
  sheet.mergeCells(brandRow.number, 1, brandRow.number, Math.max(columns.length, 1));
  brandCell.alignment = { horizontal: 'center' };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { generateExcel, DEVELOPER_FOOTER_TEXT };
