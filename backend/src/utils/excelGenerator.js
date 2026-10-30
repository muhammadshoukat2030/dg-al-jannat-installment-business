const ExcelJS = require('exceljs');

const DEVELOPER_FOOTER_TEXT = 'Software Development by SHOUKAT | 03348004300';

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

  // Also add a visible caption row below the data (separated by a blank row) so the
  // branding is visible on-screen too, not just on a printed page. Kept clearly
  // separate from the data block so it doesn't corrupt the actual report data.
  sheet.addRow([]);
  const brandRow = sheet.addRow([DEVELOPER_FOOTER_TEXT]);
  brandRow.font = { italic: true, size: 9, color: { argb: 'FF888888' } };
  sheet.mergeCells(brandRow.number, 1, brandRow.number, Math.max(columns.length, 1));
  brandRow.getCell(1).alignment = { horizontal: 'center' };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { generateExcel };
