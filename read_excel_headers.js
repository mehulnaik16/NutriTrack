import xlsx from 'xlsx';

const workbook = xlsx.readFile('./data/Anuvaad_INDB_2024.11.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Read first two rows to figure out headers
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
console.log("Sheet Name:", sheetName);
console.log("Headers Row 1:", data[0]);
console.log("Headers Row 2:", data[1]);
console.log("Sample Data Row:", data[2]);
