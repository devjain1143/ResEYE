import * as XLSXModule from 'xlsx';
const XLSX = XLSXModule.default || XLSXModule;
import path from 'path';
import fs from 'fs';

const REGISTRATION_FILE = path.resolve(process.env.REGISTRATION_FILE_PATH || './data/registration_data.xlsx');

let registrationCache = null;
let lastReloadTime = null;

const ROMAN_ORDER = {
  'I': 1, 'II': 2, 'III': 3, 'IV': 4,
  'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8
};

function isValidAddress(addr) {
  if (!addr || typeof addr !== 'string') return false;
  const cleaned = addr.replace(/[\s,.\-_/]/g, '').toUpperCase();
  if (cleaned.length < 2) return false;
  if (['NA', 'NONE', 'NIL', 'NULL'].includes(cleaned)) return false;
  return true;
}

function normalizeAddress(addr) {
  return addr.trim().replace(/\s+/g, ' ');
}

function parseWorkbook(workbook) {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const cache = new Map();

  for (const row of rows) {
    const scholarRaw = row['Scholar No'] || row['Scholar No.'] || row['scholar_no'];
    if (!scholarRaw) continue;
    const scholarNo = String(scholarRaw).trim().toUpperCase();

    let student = cache.get(scholarNo);
    if (!student) {
      student = {
        scholarNo,
        name: '',
        fatherName: '',
        category: '',
        phones: new Set(),
        emails: new Set(),
        addressesMap: new Map(),
      };
      cache.set(scholarNo, student);
    }

    const name = String(row['Candidate Name'] || row['Name'] || '').trim();
    if (name && !student.name) student.name = name;

    const father = String(row['Father/Guardian Name'] || row['Father Name'] || '').trim();
    if (father && !student.fatherName) student.fatherName = father;

    const category = String(row['Category'] || row['category'] || '').trim();
    if (category && !student.category) student.category = category;

    const phone = String(row['Contact No'] || row['Phone'] || '').trim();
    if (phone && phone.length >= 6) {
      student.phones.add(phone);
    }

    const email = String(row['Email'] || '').trim();
    if (email && email.includes('@')) {
      student.emails.add(email);
    }

    const sem = String(row['Semester'] || '').trim();
    const rawAddr = String(row['Present Address'] || '').trim();
    if (isValidAddress(rawAddr)) {
      const norm = normalizeAddress(rawAddr);
      const key = norm.toLowerCase();
      if (!student.addressesMap.has(key)) {
        student.addressesMap.set(key, {
          text: norm,
          semesters: new Set()
        });
      }
      if (sem) {
        student.addressesMap.get(key).semesters.add(sem);
      }
    }
  }

  return cache;
}

export function loadRegistrationData(forceReload = false) {
  if (registrationCache && !forceReload) {
    return registrationCache;
  }

  registrationCache = new Map();

  let targetPath = REGISTRATION_FILE;
  if (!fs.existsSync(targetPath)) {
    const altPath = path.resolve('./registration_data.xlsx');
    if (fs.existsSync(altPath)) {
      targetPath = altPath;
    } else {
      console.warn(`[Registration] File not found at ${targetPath}`);
      return registrationCache;
    }
  }

  try {
    const workbook = XLSX.readFile(targetPath);
    registrationCache = parseWorkbook(workbook);
    lastReloadTime = new Date();
  } catch (err) {
    console.error(`[Registration] Failed to read registration data:`, err.message);
  }

  return registrationCache;
}

export function reloadRegistrationData(buffer = null) {
  if (buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const newCache = parseWorkbook(workbook);
    if (newCache.size === 0) {
      throw new Error('Parsed registration file contains no valid student records.');
    }
    registrationCache = newCache;
    lastReloadTime = new Date();

    // Optionally persist buffer to disk
    try {
      fs.writeFileSync(REGISTRATION_FILE, buffer);
    } catch (e) {
      console.warn('[Registration] Could not write new sheet to disk:', e.message);
    }

    return { rowCount: registrationCache.size, lastReloadTime };
  }

  loadRegistrationData(true);
  return { rowCount: registrationCache.size, lastReloadTime };
}

export function getRegistrationMetadata() {
  const cache = loadRegistrationData();
  const reloadTime = lastReloadTime || new Date();
  return {
    rowCount: cache.size,
    lastReloadTime: reloadTime,
    lastLoadedAt: reloadTime,
    fileName: path.basename(REGISTRATION_FILE),
    sourceFile: path.basename(REGISTRATION_FILE)
  };
}

export function getRegistrationByScholarNo(scholarNo) {
  if (!scholarNo) return null;
  const cache = loadRegistrationData();
  const raw = cache.get(scholarNo.trim().toUpperCase());
  if (!raw) return null;

  const addresses = [];
  for (const entry of raw.addressesMap.values()) {
    const sortedSems = Array.from(entry.semesters).sort((a, b) => {
      const orderA = ROMAN_ORDER[a] || 99;
      const orderB = ROMAN_ORDER[b] || 99;
      return orderA - orderB;
    });

    addresses.push({
      text: entry.text,
      semesters: sortedSems
    });
  }

  return {
    scholarNo: raw.scholarNo,
    name: raw.name,
    guardian: raw.fatherName,
    fatherName: raw.fatherName,
    category: raw.category,
    phones: Array.from(raw.phones),
    phoneNumbers: Array.from(raw.phones),
    emails: Array.from(raw.emails),
    addresses
  };
}

export function searchRegistrationByName(name, limit = null) {
  if (!name) return [];
  const cache = loadRegistrationData();
  const trimmed = name.trim().toUpperCase();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const matches = [];

  for (const student of cache.values()) {
    if (!student.name) continue;
    const studentNameUpper = student.name.toUpperCase();
    const isDirectMatch = studentNameUpper.includes(trimmed);
    const isTokensMatch = tokens.length > 1 && tokens.every(token => studentNameUpper.includes(token));

    if (isDirectMatch || isTokensMatch) {
      matches.push(getRegistrationByScholarNo(student.scholarNo));
      if (limit && matches.length >= limit) break;
    }
  }

  return matches;
}
