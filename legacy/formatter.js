/**
 * Formats a student record into a clean Telegram message (MarkdownV2).
 * @param {Object} student
 * @returns {string}
 */
function formatStudent(student, registration = null) {
  const spiLines = [];
  const resultLines = [];

  for (let i = 1; i <= 8; i++) {
    const spi = student[`spi_sem_${i}`];
    const result = student[`result_sem_${i}`];

    if (spi !== null && spi !== undefined) {
      spiLines.push(`  Sem ${i}: ${spi.toFixed(2)}`);
    }
    if (result !== null && result !== undefined && result !== '') {
      resultLines.push(`  Sem ${i}: ${result}`);
    }
  }

  const cpi = student.cpi_final !== null && student.cpi_final !== undefined
    ? student.cpi_final.toFixed(2)
    : 'N/A';

  const lines = [
    `👤 *${escape(student.name)}*`,
    `🎓 Scholar No: \`${escape(student.scholar_no)}\``,
    `📚 Degree: ${escape(student.degree || 'N/A')}`,
    `🔬 Branch: ${escape(student.specialization || 'N/A')}`,
    ``,
    `📊 *SPI*`,
    ...(spiLines.length ? spiLines.map(escape) : ['  No SPI data available']),
    ``,
    `📋 *Results*`,
    ...(resultLines.length ? resultLines.map(escape) : ['  No result data available']),
    ``,
    `🏆 *Final CPI: ${escape(cpi)}*`,
  ];

  if (registration) {
    appendRegistrationDetails(lines, registration);
  }

  return lines.join('\n');
}

/**
 * Formats student record with registration details only.
 * @param {Object} registration
 * @returns {string}
 */
function formatRegistrationOnly(registration) {
  const lines = [
    `👤 *${escape(registration.name || 'Unknown')}*`,
    `🎓 Scholar No: \`${escape(registration.scholarNo)}\``,
  ];

  appendRegistrationDetails(lines, registration);

  return lines.join('\n');
}

function appendRegistrationDetails(lines, registration) {
  lines.push(``);
  lines.push(`🔒 *Registration Details*`);

  // Father's Name
  const father = registration.fatherName || 'N/A';
  lines.push(`👨‍👦 *Father's Name:* ${escape(father)}`);

  // Category
  const category = registration.category || 'N/A';
  lines.push(`🏷️ *Category:* ${escape(category)}`);

  // Phone Number(s)
  if (registration.phoneNumbers && registration.phoneNumbers.length > 0) {
    const phones = registration.phoneNumbers.map(p => escape(p)).join(', ');
    lines.push(`📞 *Phone:* ${phones}`);
  } else {
    lines.push(`📞 *Phone:* N/A`);
  }

  // Email Address(es)
  if (registration.emails && registration.emails.length > 0) {
    const emails = registration.emails.map(e => escape(e)).join(', ');
    lines.push(`📧 *Email:* ${emails}`);
  } else {
    lines.push(`📧 *Email:* N/A`);
  }

  // Address lines
  if (registration.addresses && registration.addresses.length > 0) {
    if (registration.addresses.length === 1) {
      const addr = registration.addresses[0];
      const semTag = addr.semesters && addr.semesters.length > 0
        ? ` \\(Sem ${escape(addr.semesters.join(', '))}\\)`
        : '';
      lines.push(`🏠 *Address:*`);
      lines.push(`  • ${escape(addr.text)}${semTag}`);
    } else {
      lines.push(`🏠 *Addresses:*`);
      registration.addresses.forEach((addr) => {
        const semTag = addr.semesters && addr.semesters.length > 0
          ? ` \\(Sem ${escape(addr.semesters.join(', '))}\\)`
          : '';
        lines.push(`  • ${escape(addr.text)}${semTag}`);
      });
    }
  } else {
    lines.push(`🏠 *Address:* N/A`);
  }
}

/**
 * Escape special characters for Telegram MarkdownV2.
 * @param {string|number} text
 * @returns {string}
 */
function escape(text) {
  if (text === null || text === undefined) return 'N/A';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

module.exports = { formatStudent, formatRegistrationOnly, escape };
