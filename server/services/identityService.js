import { getDb } from '../core/db.js';
import { getRegistrationByScholarNo, loadRegistrationData } from '../core/registration.js';

/**
 * Extracts a scholar number from an email or username string.
 * Institute emails are in the form <scholar_number>@iiitbhopal.ac.in (e.g. 25u020022@iiitbhopal.ac.in -> 25U020022).
 */
export function extractScholarNo(identifier) {
  if (!identifier || typeof identifier !== 'string') return null;
  const str = identifier.trim().toLowerCase();

  // Match institutional email
  const emailMatch = str.match(/^([a-z0-9._-]+)@(?:[a-z0-9.-]+\.)?iiitbhopal\.ac\.in$/);
  if (emailMatch) {
    const local = emailMatch[1].split('+')[0];
    const scholarMatch = local.match(/^(\d{2}[a-z0-9]+)$/i);
    if (scholarMatch) return scholarMatch[1].toUpperCase();
    return local.toUpperCase();
  }

  // Match direct scholar number pattern (e.g. 20U02035, 25U020022, 21U01019)
  const directMatch = str.match(/^(\d{2}[a-z0-9]{5,8})$/i);
  if (directMatch) return directMatch[1].toUpperCase();

  return null;
}

/**
 * Look up registration data for a scholar number, checking in-memory cache first,
 * then falling back to Neon DB's student_registrations table.
 */
export async function getRegistrationDetails(scholarNo) {
  if (!scholarNo) return null;
  const cleanNo = scholarNo.trim().toUpperCase();

  // 1. Check in-memory cache
  loadRegistrationData();
  const cached = getRegistrationByScholarNo(cleanNo);
  if (cached && (cached.name || cached.fatherName || (cached.phones && cached.phones.length > 0))) {
    return cached;
  }

  // 2. Query Neon DB student_registrations table
  try {
    const db = getDb();
    const res = await db.query(
      'SELECT * FROM student_registrations WHERE UPPER(scholar_no) = $1 ORDER BY id DESC',
      [cleanNo]
    );
    if (res.rows.length === 0) return null;

    const phones = new Set();
    const emails = new Set();
    const addresses = [];
    const seenAddr = new Set();
    let name = '';
    let fatherName = '';
    let category = '';
    let course = '';

    for (const r of res.rows) {
      if (!name && r.candidate_name) name = r.candidate_name.trim();
      if (!fatherName && r.father_name) fatherName = r.father_name.trim();
      if (!category && r.category) category = r.category.trim();
      if (!course && r.course) course = r.course.trim();
      if (r.contact_no && r.contact_no.trim().length >= 6) phones.add(r.contact_no.trim());
      if (r.email && r.email.includes('@')) emails.add(r.email.trim());
      if (r.present_address) {
        const addrText = r.present_address.trim().replace(/\s+/g, ' ');
        if (addrText.length > 5 && !seenAddr.has(addrText.toLowerCase())) {
          seenAddr.add(addrText.toLowerCase());
          addresses.push({ text: addrText, semesters: r.semester ? [r.semester] : [] });
        }
      }
    }

    return {
      scholarNo: cleanNo,
      name,
      guardian: fatherName,
      fatherName,
      category,
      course,
      phones: Array.from(phones),
      phoneNumbers: Array.from(phones),
      emails: Array.from(emails),
      addresses
    };
  } catch (err) {
    console.error('[IdentityService] Error querying student_registrations:', err.message);
    return null;
  }
}

/**
 * Resolves a rich user identity given a user object, webUserId, or email string.
 */
export async function identifyUser(userOrId) {
  if (!userOrId) return null;

  let webUserId = null;
  let username = null;
  let email = null;
  let role = null;

  if (typeof userOrId === 'object') {
    webUserId = userOrId.id || userOrId.webUserId || userOrId.userId || null;
    username = userOrId.username || null;
    email = userOrId.email || null;
    role = userOrId.role || null;
  } else if (typeof userOrId === 'string') {
    if (userOrId.includes('@')) {
      email = userOrId;
    } else {
      webUserId = userOrId;
    }
  }

  // If email is missing but we have webUserId, query auth."User"
  if (!email && webUserId) {
    try {
      const db = getDb();
      const res = await db.query(
        'SELECT id, username, email, role FROM auth."User" WHERE id = $1',
        [webUserId]
      );
      if (res.rows.length > 0) {
        email = res.rows[0].email;
        if (!username) username = res.rows[0].username;
        if (!role) role = res.rows[0].role;
      }
    } catch (err) {
      console.error('[IdentityService] Error fetching user from auth.User:', err.message);
    }
  }

  const scholarNo = extractScholarNo(email) || extractScholarNo(username);
  let reg = null;
  if (scholarNo) {
    reg = await getRegistrationDetails(scholarNo);
  }

  return {
    webUserId,
    username,
    email,
    role,
    scholarNo,
    identified: Boolean(reg && reg.name),
    realName: reg?.name || username || 'UNKNOWN SUBJECT',
    fatherName: reg?.fatherName || reg?.guardian || null,
    category: reg?.category || null,
    phone: reg?.phones?.[0] || null,
    personalEmail: reg?.emails?.[0] || null,
    address: reg?.addresses?.[0]?.text || null,
    addresses: reg?.addresses || [],
    course: reg?.course || null,
    rawRegistration: reg
  };
}

/**
 * Formats a rich, readable Telegram alert message identifying the user.
 */
export async function formatTelegramAlertMessage(kind, webUserId, details = {}) {
  const identity = await identifyUser(webUserId || details?.searcher || details?.user);
  const nowIST = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(new Date());

  let headerIcon = '🚨';
  if (kind === 'SPECIAL_HIT') headerIcon = '🎯';
  else if (kind === 'SPECIAL_PIN') headerIcon = '📌';
  else if (kind === 'ENUMERATION') headerIcon = '⚠️';
  else if (kind.includes('SWEEP')) headerIcon = '⚡';

  let msg = `${headerIcon} <b>[ResEYE TELEMETRY] ${kind}</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  // User Identification Section
  msg += `👤 <b>OPERATOR IDENTIFIED:</b>\n`;
  if (identity && identity.identified) {
    msg += `• <b>Name:</b> ${identity.realName}\n`;
    msg += `• <b>Scholar No:</b> <code>${identity.scholarNo}</code>\n`;
    if (identity.fatherName) msg += `• <b>Father's Name:</b> ${identity.fatherName}\n`;
    if (identity.category) msg += `• <b>Category:</b> ${identity.category}\n`;
    if (identity.phone) msg += `• <b>Phone:</b> ${identity.phone}\n`;
    if (identity.email) msg += `• <b>Institute Email:</b> <code>${identity.email}</code>\n`;
    if (identity.personalEmail) msg += `• <b>Personal Email:</b> ${identity.personalEmail}\n`;
    if (identity.address) msg += `• <b>Address:</b> ${identity.address}\n`;
    if (identity.username) msg += `• <b>Username:</b> @${identity.username}\n`;
  } else if (identity && identity.email) {
    msg += `• <b>Email:</b> <code>${identity.email}</code>\n`;
    if (identity.scholarNo) msg += `• <b>Scholar No:</b> <code>${identity.scholarNo}</code>\n`;
    if (identity.username) msg += `• <b>Username:</b> @${identity.username}\n`;
  } else {
    msg += `• <b>ID:</b> <code>${webUserId || 'Unauthenticated / System'}</code>\n`;
  }

  // Kind-specific Target Details
  if (kind === 'SPECIAL_HIT' && details.student) {
    msg += `\n🎓 <b>MONITORED SUBJECT ACCESSED:</b>\n`;
    msg += `• <b>Name:</b> ${details.student.name || 'N/A'}\n`;
    msg += `• <b>Scholar No:</b> <code>${details.student.scholarNo || 'N/A'}</code>\n`;

    if (details.timelineOfPastSearches && Array.isArray(details.timelineOfPastSearches) && details.timelineOfPastSearches.length > 0) {
      msg += `\n📜 <b>PAST SEARCH TIMELINE ON THIS SCHOLAR:</b>\n`;
      const recentLogs = details.timelineOfPastSearches.slice(0, 10);
      for (let i = 0; i < recentLogs.length; i++) {
        const log = recentLogs[i];
        let searcherLabel = log.first_name || log.username || 'User';
        const pastScholarNo = extractScholarNo(log.username) || extractScholarNo(log.email);
        if (pastScholarNo) {
          const pastReg = await getRegistrationDetails(pastScholarNo);
          if (pastReg?.name) {
            searcherLabel = `${pastReg.name} (${pastScholarNo})`;
          }
        }
        msg += `${i + 1}. <b>${searcherLabel}</b> — <i>${log.timestamp || ''}</i>\n`;
      }
      if (details.timelineOfPastSearches.length > 10) {
        msg += `<i>...and ${details.timelineOfPastSearches.length - 10} earlier searches.</i>\n`;
      }
    }
  } else if (kind === 'SPECIAL_PIN') {
    msg += `\n📌 <b>PINNED MONITORED SCHOLAR:</b> <code>${details.scholarNo || 'N/A'}</code>\n`;
  } else if (kind === 'ENUMERATION') {
    msg += `\n📋 <b>ENUMERATION PATTERN:</b>\n`;
    if (details.reason) msg += `• <b>Reason:</b> ${details.reason}\n`;
    if (details.recentQueries && Array.isArray(details.recentQueries)) {
      msg += `• <b>Probed Numbers:</b> <code>${details.recentQueries.slice(0, 10).join(', ')}</code>\n`;
    }
  } else if (kind.includes('SWEEP')) {
    msg += `\n⚡ <b>SWEEP TARGET:</b>\n`;
    if (details.batch) msg += `• <b>Batch:</b> ${details.batch}\n`;
    if (details.semester) msg += `• <b>Semester:</b> ${details.semester}\n`;
  }

  msg += `\n🕒 <b>Timestamp:</b> ${nowIST}`;
  return msg;
}
