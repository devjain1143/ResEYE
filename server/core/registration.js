import * as XLSXModule from 'xlsx';
const XLSX = XLSXModule.default || XLSXModule;
import path from 'path';
import fs from 'fs';
import { encryptFileBuffer, decryptFileBuffer } from '../crypto/index.js';

const REGISTRATION_FILE = path.resolve(process.env.REGISTRATION_FILE_PATH || './data/registration_data.xlsx');
const REGISTRATION_ENC_FILE = REGISTRATION_FILE.endsWith('.enc') ? REGISTRATION_FILE : `${REGISTRATION_FILE}.enc`;

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

  try {
    let workbook = null;
    if (fs.existsSync(REGISTRATION_ENC_FILE)) {
      const encContent = fs.readFileSync(REGISTRATION_ENC_FILE, 'utf8');
      const decryptedBuf = decryptFileBuffer(encContent, 'registration_data.xlsx', 'v1');
      workbook = XLSX.read(decryptedBuf, { type: 'buffer' });
    } else if (fs.existsSync(REGISTRATION_FILE)) {
      // Auto-migrate plaintext to encrypted file at rest
      const plaintextBuf = fs.readFileSync(REGISTRATION_FILE);
      workbook = XLSX.read(plaintextBuf, { type: 'buffer' });
      try {
        const encData = encryptFileBuffer(plaintextBuf, 'registration_data.xlsx', 'v1');
        fs.writeFileSync(REGISTRATION_ENC_FILE, encData, 'utf8');
        fs.unlinkSync(REGISTRATION_FILE);
        console.log(`[Registration] Migrated plaintext file to encrypted storage: ${REGISTRATION_ENC_FILE}`);
      } catch (err) {
        console.warn('[Registration] Warning: could not persist encrypted file:', err.message);
      }
    } else {
      console.warn(`[Registration] Registration file not found (checked ${REGISTRATION_ENC_FILE} and ${REGISTRATION_FILE})`);
      return registrationCache;
    }

    if (workbook) {
      registrationCache = parseWorkbook(workbook);
      lastReloadTime = new Date();
    }
  } catch (err) {
    console.error(`[Registration] Failed to load registration data:`, err.message);
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

    // Persist encrypted file to disk
    try {
      const encEnvelope = encryptFileBuffer(buffer, 'registration_data.xlsx', 'v1');
      fs.writeFileSync(REGISTRATION_ENC_FILE, encEnvelope, 'utf8');
      if (fs.existsSync(REGISTRATION_FILE) && REGISTRATION_FILE !== REGISTRATION_ENC_FILE) {
        try { fs.unlinkSync(REGISTRATION_FILE); } catch {}
      }
    } catch (e) {
      console.warn('[Registration] Could not write encrypted sheet to disk:', e.message);
    }

    return { rowCount: registrationCache.size, lastReloadTime };
  }

  loadRegistrationData(true);
  return { rowCount: registrationCache.size, lastReloadTime };
}

export function getRegistrationMetadata() {
  const cache = loadRegistrationData();
  const reloadTime = lastReloadTime || new Date();
  const baseName = path.basename(REGISTRATION_ENC_FILE);
  return {
    loaded: cache.size > 0,
    rowCount: cache.size,
    lastReloadTime: reloadTime,
    lastLoadedAt: reloadTime,
    fileName: baseName,
    sourceFile: baseName
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
