require('dotenv').config();
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const { initSchema } = require('./db');
const { getByScholarNo, searchByName, searchUnifiedStudents, getByCallback, logSearch, getSearchHistory, getAllSearchHistory, getHistoryByFilter, getHistoryByScholarNo, getHistoryByUserId, getAiHistoryByFilter, getAiHistoryByUserId, getUnratedAiQueries, getAiQueryById, rateAiQuery, addFeedbackCorrection } = require('./query');
const { formatStudent, formatRegistrationOnly, escape } = require('./formatter');
const { isScholarNumber, isAllowed, checkRateLimit, getWhitelist, addToWhitelist, removeFromWhitelist, isSpecialScholar, addSpecialScholar, removeSpecialScholar, getSpecialScholars } = require('./utils');
const { getRegistrationByScholarNo, searchRegistrationByName, loadRegistrationData } = require('./registration');
const { handleNLQ, handleDebugIntent } = require('../nlq');
const { getRemainingDailyQueries } = require('../nlq/rateLimiter');
const { parseCorrectionInput } = require('../nlq/feedbackParser');

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

if (!process.env.BOT_TOKEN) {
  console.error('[Bot] BOT_TOKEN is not set in .env');
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0', 10);

bot.catch((err, ctx) => {
  console.error(`[Bot] Error in update ${ctx?.update?.update_id}:`, err);
});

function isAdmin(userId) {
  if (!userId) return false;
  if (ADMIN_ID && userId === ADMIN_ID) return true;
  if (process.env.ADMIN_IDS) {
    const ids = process.env.ADMIN_IDS.split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean);
    if (ids.includes(userId)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────
// MIDDLEWARE: Access Control
// ─────────────────────────────────────────────

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const allowed = await isAllowed(userId);
  if (!allowed) {
    return ctx.reply(
      '🚫 Access Denied.\n\nYou are not authorized to use this bot.\nContact the administrator telegram.me/bru_fu02 for requesting access.'
    );
  }

  return next();
});

// ─────────────────────────────────────────────
// MIDDLEWARE: Rate Limiting
// ─────────────────────────────────────────────

bot.use((ctx, next) => {
  // Skip rate limit for callback queries (button clicks) — they don't query the DB multiple times
  if (ctx.callbackQuery) return next();

  const userId = ctx.from?.id;
  const { allowed, remaining } = checkRateLimit(userId);

  if (!allowed) {
    return ctx.reply('⏳ You are sending too many requests. Please wait a minute and try again.');
  }

  return next();
});

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// COMMAND MENUS & KEYBOARDS
// ─────────────────────────────────────────────

const DEFAULT_COMMANDS = [
  { command: 'start', description: 'Start the bot' },
  { command: 'ai', description: 'Ask academic AI queries (/ai <query>)' },
  { command: 'help', description: 'Search guide & help' }
];

const ADMIN_COMMANDS = [
  { command: 'start', description: 'Start the bot' },
  { command: 'ai', description: 'Ask academic AI queries' },
  { command: 'help', description: 'Bot help & commands' },
  { command: 'his', description: 'View search & AI query logs' },
  { command: 'feedback', description: 'Review & correct AI queries' },
  { command: 'showuser', description: 'List whitelisted users' },
  { command: 'adduser', description: 'Approve user ID' },
  { command: 'rmuser', description: 'Remove approved user ID' },
  { command: 'showspecial', description: 'View tracked scholars' },
  { command: 'special', description: 'Track scholar searches' },
  { command: 'rmspecial', description: 'Untrack scholar' },
  { command: 'exportdata', description: 'Export history to Excel' },
  { command: 'reloadreg', description: 'Reload registration data' },
  { command: 'announce', description: 'Broadcast message to users' },
  { command: 'nlq_debug', description: 'Test NLQ intent parsing' }
];

async function setupBotCommands() {
  try {
    await bot.telegram.setMyCommands(DEFAULT_COMMANDS, { scope: { type: 'default' } });

    const adminIds = new Set();
    if (ADMIN_ID) adminIds.add(ADMIN_ID);
    if (process.env.ADMIN_IDS) {
      process.env.ADMIN_IDS.split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean).forEach(id => adminIds.add(id));
    }

    for (const adminId of adminIds) {
      try {
        await bot.telegram.setMyCommands(ADMIN_COMMANDS, { scope: { type: 'chat', chat_id: adminId } });
      } catch (err) {
        console.warn(`[Bot] Could not set admin command menu for chat ${adminId}:`, err.message);
      }
    }
    console.log('[Bot] Command menus registered successfully.');
  } catch (err) {
    console.error('[Bot] Failed to set bot commands:', err.message);
  }
}

function getMainMenu(userId) {
  if (isAdmin(userId)) {
    return Markup.keyboard([
      [
        Markup.button.userRequest('👤 Share / Add User', 1, { user_is_bot: false }),
        '👥 Whitelisted Users'
      ],
      ['📜 Search History', '⭐ Special Scholars'],
      ['🤖 AI Search', '📝 AI Feedback'],
      ['📢 Broadcast Announcement', '📊 Export Data'],
      ['🔄 Reload Reg Data', '❓ Help & Guide'],
      ['❌ Hide Menu']
    ]).resize();
  }

  return Markup.keyboard([
    ['🔍 Search Guide', '🤖 AI Academic Search'],
    ['❓ Help', '❌ Hide Menu']
  ]).resize();
}

// ─────────────────────────────────────────────
// COMMAND: /start
// ─────────────────────────────────────────────

bot.start(async (ctx) => {
  const name = ctx.from.first_name || 'there';
  const menu = getMainMenu(ctx.from?.id);

  if (isAdmin(ctx.from?.id)) {
    try {
      await bot.telegram.setMyCommands(ADMIN_COMMANDS, { scope: { type: 'chat', chat_id: ctx.from.id } });
    } catch {}
  }

  ctx.reply(
    `👋 Hello, ${name}!\n\n` +
    `Welcome to the *Student Academic Lookup Bot*.\n\n` +
    `You can search by:\n` +
    `• *Scholar Number* — e.g. \`25U020130\`\n` +
    `• *Name* — e.g. \`Anubhav\`\n` +
    `• *AI Assistant* — Ask questions using \`/ai <query>\`\n` +
    `  ↳ _e.g._ \`/ai who topped 2nd sem in ece-28?\`\n` +
    `  ↳ _e.g._ \`/ai average CPI of cse-26\`\n\n` +
    (isAdmin(ctx.from?.id)
      ? `👑 *Admin Access Enabled*: Tap any interactive button below or use the *Menu* button [/] to manage the bot.`
      : `Use the menu buttons below to navigate, or simply type your query.`),
    {
      parse_mode: 'Markdown',
      ...menu
    }
  );
});

// ─────────────────────────────────────────────
// COMMAND: /menu (Show Keyboard Buttons)
// ─────────────────────────────────────────────

bot.command('menu', async (ctx) => {
  const args = ctx.message.text.split(/\s+/);
  if (args.length > 1 && args[1].trim() && isAdmin(ctx.from?.id)) {
    const targetUserId = parseInt(args[1].trim(), 10);
    if (!isNaN(targetUserId)) {
      try {
        const targetMenu = getMainMenu(targetUserId);
        await ctx.telegram.sendMessage(
          targetUserId,
          '📱 *Main Menu Activated*',
          { parse_mode: 'Markdown', ...targetMenu }
        );
        return ctx.reply(`✅ Sent keyboard menu to user \`${targetUserId}\`.`, { parse_mode: 'Markdown' });
      } catch (err) {
        return ctx.reply(`⚠️ Failed to send menu to user: ${err.message}`);
      }
    }
  }

  const menu = getMainMenu(ctx.from?.id);
  return ctx.reply('📱 *Main Menu Activated*', {
    parse_mode: 'Markdown',
    ...menu
  });
});

// ─────────────────────────────────────────────
// COMMAND: /hidemenu (Deactivate Keyboard Buttons)
// ─────────────────────────────────────────────

bot.command(['hidemenu', 'removemenu', 'closemenu'], async (ctx) => {
  const args = ctx.message.text.split(/\s+/);
  if (args.length > 1 && args[1].trim() && isAdmin(ctx.from?.id)) {
    const targetUserId = parseInt(args[1].trim(), 10);
    if (!isNaN(targetUserId)) {
      try {
        await ctx.telegram.sendMessage(
          targetUserId,
          '⌨️ Keyboard buttons have been deactivated. Use /menu to show them again.',
          Markup.removeKeyboard()
        );
        return ctx.reply(`✅ Removed keyboard buttons for user \`${targetUserId}\`.`, { parse_mode: 'Markdown' });
      } catch (err) {
        return ctx.reply(`⚠️ Failed to remove keyboard for user: ${err.message}`);
      }
    }
  }

  return ctx.reply('⌨️ Keyboard buttons have been deactivated. Send /menu anytime to bring them back.', Markup.removeKeyboard());
});

// ─────────────────────────────────────────────
// COMMAND: /help
// ─────────────────────────────────────────────

bot.help((ctx) => {
  const menu = getMainMenu(ctx.from?.id);
  const adminHelp = isAdmin(ctx.from?.id)
    ? `\n\n*Admin Interactive Keyboard:*\n` +
      `• 👤 *Share / Add User* — Pick a contact to approve\n` +
      `• 👥 *Whitelisted Users* — Manage whitelisted users\n` +
      `• 📜 *Search History* — Filter logs & AI question history\n` +
      `• ⭐ *Special Scholars* — Track VIP scholar searches\n` +
      `• 🤖 *AI Search* — Query academic records with AI\n` +
      `• 📝 *AI Feedback* — Review & correct AI intents\n` +
      `• 📢 *Broadcast Announcement* — Send broadcast with preview\n` +
      `• 📊 *Export Data* — Export search logs to Excel\n` +
      `• 🔄 *Reload Reg Data* — Refresh student cache\n` +
      `• /nlq_debug <json> — Test NLQ intent parsing`
    : `\n\n*Commands:*\n• /menu - Activate keyboard buttons\n• /hidemenu - Deactivate keyboard buttons`;

  ctx.reply(
    `📖 *How to use this bot*\n\n` +
    `*Search by Scholar Number:*\n` +
    `Send the exact scholar number.\n` +
    `Example: \`25U020130\`\n\n` +
    `*Search by Name:*\n` +
    `Send a partial or full name.\n` +
    `Example: \`Anubhav\`\n\n` +
    `*AI Natural Language Query:*\n` +
    `Ask academic questions using \`/ai <question>\` or the *🤖 AI Academic Search* button\\.\n` +
    `Example: \`/ai who topped 2nd sem in ece-28?\`\n\n` +
    `If multiple students match, you'll get a list to choose from.\n\n` +
    `_Rate limit: 10 queries per minute._` +
    adminHelp,
    {
      parse_mode: 'Markdown',
      ...menu
    }
  );
});

// ─────────────────────────────────────────────
// COMMAND: /his (Admin only)
// ─────────────────────────────────────────────

// Helper to format timestamp to 12-hour format
function formatTo12Hour(timestamp) {
  if (!timestamp) return '';
  if (typeof timestamp === 'string') {
    if (timestamp.includes('AM') || timestamp.includes('PM')) {
      return timestamp;
    }
    const parts = timestamp.split(' ');
    if (parts.length === 2) {
      const datePart = parts[0];
      const timePart = parts[1];
      const timeSubparts = timePart.split(':');
      if (timeSubparts.length >= 2) {
        let hours = parseInt(timeSubparts[0], 10);
        const minutes = timeSubparts[1];
        const seconds = timeSubparts[2] ? timeSubparts[2].split('.')[0] : '00';
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        const formattedHours = String(hours).padStart(2, '0');
        return `${datePart} ${formattedHours}:${minutes}:${seconds} ${ampm}`;
      }
    }
    const d = new Date(timestamp);
    if (!isNaN(d.getTime())) {
      timestamp = d;
    } else {
      return timestamp;
    }
  }
  if (timestamp instanceof Date && !isNaN(timestamp.getTime())) {
    const year = timestamp.getFullYear();
    const month = String(timestamp.getMonth() + 1).padStart(2, '0');
    const day = String(timestamp.getDate()).padStart(2, '0');
    let hours = timestamp.getHours();
    const minutes = String(timestamp.getMinutes()).padStart(2, '0');
    const seconds = String(timestamp.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const formattedHours = String(hours).padStart(2, '0');
    return `${year}-${month}-${day} ${formattedHours}:${minutes}:${seconds} ${ampm}`;
  }
  return String(timestamp);
}

const TIMEFRAME_LABELS = {
  '1h': 'Last 1 Hour',
  '24h': 'Last 24 Hours',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  'all': 'Complete History',
};

function getHistoryFilterKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⏱️ Last 1 Hour', 'his_tf:1h'),
      Markup.button.callback('🕒 Last 24 Hours', 'his_tf:24h'),
    ],
    [
      Markup.button.callback('🗓️ Last 7 Days', 'his_tf:7d'),
      Markup.button.callback('📅 Last 30 Days', 'his_tf:30d'),
    ],
    [
      Markup.button.callback('📜 Complete Search History', 'his_tf:all'),
    ],
    [
      Markup.button.callback('🤖 AI Question History', 'his_ai_menu'),
    ],
  ]);
}

function getAiHistoryFilterKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⏱️ Last 1 Hour', 'his_aitf:1h'),
      Markup.button.callback('🕒 Last 24 Hours', 'his_aitf:24h'),
    ],
    [
      Markup.button.callback('🗓️ Last 7 Days', 'his_aitf:7d'),
      Markup.button.callback('📅 Last 30 Days', 'his_aitf:30d'),
    ],
    [
      Markup.button.callback('🤖 Complete AI History', 'his_aitf:all'),
    ],
    [
      Markup.button.callback('🔙 Search History Menu', 'his_menu'),
    ],
  ]);
}

async function renderHistoryPage(ctx, timeframe, page = 1, isEdit = false) {
  const pageSize = 30;
  const { results, total } = await getHistoryByFilter(timeframe, page, pageSize);
  const tfLabel = TIMEFRAME_LABELS[timeframe] || 'Search History';

  if (total === 0) {
    const text = `📭 No search history found for *${escape(tfLabel)}*\\.`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Change Filter', 'his_menu')],
    ]);
    if (isEdit) {
      return ctx.editMessageText(text, { parse_mode: 'MarkdownV2', ...keyboard });
    } else {
      return ctx.reply(text, { parse_mode: 'MarkdownV2', ...keyboard });
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  let message = `📜 *${escape(tfLabel)}* \\(Total: *${total}*\\) — Page *${currentPage}* of *${totalPages}*:\n\n`;

  results.forEach((log, index) => {
    const itemNum = (currentPage - 1) * pageSize + index + 1;
    const userStr = log.username ? `@${escape(log.username)}` : `ID: \`${log.user_id}\``;
    const userName = log.first_name ? escape(log.first_name) : 'User';
    const formattedTime = formatTo12Hour(log.timestamp);
    message += `${itemNum}\\. *${userName}* \\(${userStr}\\) searched for *${escape(log.student_name)}* \\(\`${escape(log.scholar_no)}\`\\)\n   _at ${escape(formattedTime)}_\n\n`;
  });

  const buttons = [];
  const navRow = [];

  if (currentPage > 1) {
    navRow.push(Markup.button.callback('⬅️ Prev', `his_pg:${timeframe}:${currentPage - 1}`));
  }
  navRow.push(Markup.button.callback(`${currentPage}/${totalPages}`, 'noop'));
  if (currentPage < totalPages) {
    navRow.push(Markup.button.callback('Next ➡️', `his_pg:${timeframe}:${currentPage + 1}`));
  }

  if (navRow.length > 0) {
    buttons.push(navRow);
  }

  buttons.push([
    Markup.button.callback('🔄 Refresh', `his_pg:${timeframe}:${currentPage}`),
    Markup.button.callback('🔙 Change Filter', 'his_menu'),
  ]);

  const keyboard = Markup.inlineKeyboard(buttons);

  if (isEdit) {
    return ctx.editMessageText(message, { parse_mode: 'MarkdownV2', ...keyboard });
  } else {
    return ctx.reply(message, { parse_mode: 'MarkdownV2', ...keyboard });
  }
}

async function renderUserHistoryPage(ctx, targetUserId, page = 1, isEdit = false) {
  const pageSize = 30;
  const { results, total } = await getHistoryByUserId(targetUserId, page, pageSize);

  if (total === 0) {
    const text = `📭 No search history found for user ID \`${targetUserId}\`\\.`;
    if (isEdit) {
      return ctx.editMessageText(text, { parse_mode: 'MarkdownV2' });
    } else {
      return ctx.reply(text, { parse_mode: 'MarkdownV2' });
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const firstLog = results[0];
  const userStr = firstLog.username ? `@${escape(firstLog.username)}` : `ID: \`${targetUserId}\``;
  const userName = firstLog.first_name ? escape(firstLog.first_name) : 'User';

  let message = `📜 *Search History for ${userName}* \\(${userStr}\\)\nTotal Searches: *${total}* — Page *${currentPage}* of *${totalPages}*:\n\n`;

  results.forEach((log, index) => {
    const itemNum = (currentPage - 1) * pageSize + index + 1;
    const formattedTime = formatTo12Hour(log.timestamp);
    message += `${itemNum}\\. Searched for *${escape(log.student_name)}* \\(\`${escape(log.scholar_no)}\`\\)\n   _at ${escape(formattedTime)}_\n\n`;
  });

  const buttons = [];
  const navRow = [];

  if (currentPage > 1) {
    navRow.push(Markup.button.callback('⬅️ Prev', `his_usr:${targetUserId}:${currentPage - 1}`));
  }
  navRow.push(Markup.button.callback(`${currentPage}/${totalPages}`, 'noop'));
  if (currentPage < totalPages) {
    navRow.push(Markup.button.callback('Next ➡️', `his_usr:${targetUserId}:${currentPage + 1}`));
  }

  if (navRow.length > 0) {
    buttons.push(navRow);
  }

  buttons.push([
    Markup.button.callback('🔄 Refresh', `his_usr:${targetUserId}:${currentPage}`)
  ]);

  const keyboard = Markup.inlineKeyboard(buttons);

  if (isEdit) {
    return ctx.editMessageText(message, { parse_mode: 'MarkdownV2', ...keyboard });
  } else {
    return ctx.reply(message, { parse_mode: 'MarkdownV2', ...keyboard });
  }
}

async function renderAiHistoryPage(ctx, timeframe, page = 1, isEdit = false) {
  const pageSize = 10;
  const { results, total } = await getAiHistoryByFilter(timeframe, page, pageSize);
  const tfLabel = TIMEFRAME_LABELS[timeframe] || 'AI Questions';

  if (total === 0) {
    const text = `📭 No AI questions found for *${escape(tfLabel)}*\\.`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Change Filter', 'his_ai_menu')],
      [Markup.button.callback('🔙 Search History', 'his_menu')],
    ]);
    if (isEdit) {
      return ctx.editMessageText(text, { parse_mode: 'MarkdownV2', ...keyboard });
    } else {
      return ctx.reply(text, { parse_mode: 'MarkdownV2', ...keyboard });
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  let message = `🤖 *AI Questions — ${escape(tfLabel)}* \\(Total: *${total}*\\) — Page *${currentPage}* of *${totalPages}*:\n\n`;

  results.forEach((log, index) => {
    const itemNum = (currentPage - 1) * pageSize + index + 1;
    const userStr = log.username ? `@${escape(log.username)}` : `ID: \`${log.user_id}\``;
    const userName = log.first_name ? escape(log.first_name) : 'User';
    const statusIcon = log.is_answered ? '✅' : '❌';
    const cacheTag = log.is_cache_hit ? ' \\[⚡ Cache\\]' : '';
    const formattedTime = log.timestamp || 'recently';

    message += `${itemNum}\\. ${statusIcon} *${userName}* \\(${userStr}\\)${cacheTag}:\n`;
    message += `   ❓ _\"${escape(log.query_text || '')}\"_\n`;
    if (!log.is_answered && log.rejection_reason) {
      message += `   ↳ ⚠️ _Reason: ${escape(log.rejection_reason)}_\n`;
    } else if (log.intent) {
      const batchPart = log.batch ? ` \\| Batch: ${escape(log.batch)}` : '';
      message += `   ↳ 🎯 _Intent: ${escape(log.intent)}${batchPart}_\n`;
    }
    message += `   🕒 _at ${escape(formattedTime)}_\n\n`;
  });

  const buttons = [];
  const navRow = [];

  if (currentPage > 1) {
    navRow.push(Markup.button.callback('⬅️ Prev', `his_aipg:${timeframe}:${currentPage - 1}`));
  }
  navRow.push(Markup.button.callback(`${currentPage}/${totalPages}`, 'noop'));
  if (currentPage < totalPages) {
    navRow.push(Markup.button.callback('Next ➡️', `his_aipg:${timeframe}:${currentPage + 1}`));
  }

  if (navRow.length > 0) {
    buttons.push(navRow);
  }

  buttons.push([
    Markup.button.callback('🔄 Refresh', `his_aipg:${timeframe}:${currentPage}`),
    Markup.button.callback('🔙 AI Filters', 'his_ai_menu'),
  ]);
  buttons.push([
    Markup.button.callback('🔙 Search History Menu', 'his_menu'),
  ]);

  const keyboard = Markup.inlineKeyboard(buttons);

  if (isEdit) {
    return ctx.editMessageText(message, { parse_mode: 'MarkdownV2', ...keyboard });
  } else {
    return ctx.reply(message, { parse_mode: 'MarkdownV2', ...keyboard });
  }
}

async function renderUserAiHistoryPage(ctx, targetUserId, page = 1, isEdit = false) {
  const pageSize = 10;
  const { results, total } = await getAiHistoryByUserId(targetUserId, page, pageSize);

  if (total === 0) {
    const text = `📭 No AI questions found for user ID \`${targetUserId}\`\\.`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 AI Filters', 'his_ai_menu')],
      [Markup.button.callback('🔙 Search History', 'his_menu')],
    ]);
    if (isEdit) {
      return ctx.editMessageText(text, { parse_mode: 'MarkdownV2', ...keyboard });
    } else {
      return ctx.reply(text, { parse_mode: 'MarkdownV2', ...keyboard });
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const firstLog = results[0];
  const userStr = firstLog.username ? `@${escape(firstLog.username)}` : `ID: \`${targetUserId}\``;
  const userName = firstLog.first_name ? escape(firstLog.first_name) : 'User';

  let message = `🤖 *AI Question History for ${userName}* \\(${userStr}\\)\nTotal Queries: *${total}* — Page *${currentPage}* of *${totalPages}*:\n\n`;

  results.forEach((log, index) => {
    const itemNum = (currentPage - 1) * pageSize + index + 1;
    const statusIcon = log.is_answered ? '✅' : '❌';
    const cacheTag = log.is_cache_hit ? ' \\[⚡ Cache\\]' : '';
    const formattedTime = log.timestamp || 'recently';

    message += `${itemNum}\\. ${statusIcon} _\"${escape(log.query_text || '')}\"_${cacheTag}\n`;
    if (!log.is_answered && log.rejection_reason) {
      message += `   ↳ ⚠️ _Reason: ${escape(log.rejection_reason)}_\n`;
    } else if (log.intent) {
      const batchPart = log.batch ? ` \\| Batch: ${escape(log.batch)}` : '';
      message += `   ↳ 🎯 _Intent: ${escape(log.intent)}${batchPart}_\n`;
    }
    message += `   🕒 _at ${escape(formattedTime)}_\n\n`;
  });

  const buttons = [];
  const navRow = [];

  if (currentPage > 1) {
    navRow.push(Markup.button.callback('⬅️ Prev', `his_aiusr:${targetUserId}:${currentPage - 1}`));
  }
  navRow.push(Markup.button.callback(`${currentPage}/${totalPages}`, 'noop'));
  if (currentPage < totalPages) {
    navRow.push(Markup.button.callback('Next ➡️', `his_aiusr:${targetUserId}:${currentPage + 1}`));
  }

  if (navRow.length > 0) {
    buttons.push(navRow);
  }

  buttons.push([
    Markup.button.callback('🔄 Refresh', `his_aiusr:${targetUserId}:${currentPage}`),
    Markup.button.callback('🔙 AI Filters', 'his_ai_menu'),
  ]);
  buttons.push([
    Markup.button.callback('🔙 Search History Menu', 'his_menu'),
  ]);

  const keyboard = Markup.inlineKeyboard(buttons);

  if (isEdit) {
    return ctx.editMessageText(message, { parse_mode: 'MarkdownV2', ...keyboard });
  } else {
    return ctx.reply(message, { parse_mode: 'MarkdownV2', ...keyboard });
  }
}

bot.command('his', async (ctx) => {
  const userId = ctx.from?.id;
  if (userId !== ADMIN_ID) {
    return ctx.reply('🚫 Unauthorized. Only the administrator can run this command.');
  }

  const args = ctx.message.text.split(/\s+/);
  if (args.length > 1 && args[1].trim()) {
    if (args[1].toLowerCase() === 'ai') {
      if (args.length > 2 && args[2].trim()) {
        const targetUserId = parseInt(args[2].trim(), 10);
        if (isNaN(targetUserId)) {
          return ctx.reply('⚠️ Please provide a valid numeric Telegram User ID.\n\n*Usage:* `/his ai <user_id>`', { parse_mode: 'Markdown' });
        }
        return renderUserAiHistoryPage(ctx, targetUserId, 1, false);
      }
      return ctx.reply(
        '🤖 *AI Question History*\n\nSelect a timeframe to view AI questions:',
        {
          parse_mode: 'Markdown',
          ...getAiHistoryFilterKeyboard(),
        }
      );
    }

    const targetUserId = parseInt(args[1].trim(), 10);
    if (isNaN(targetUserId)) {
      return ctx.reply('⚠️ Please provide a valid numeric Telegram User ID.\n\n*Usage:* `/his <user_id>` or `/his ai` or `/his`', { parse_mode: 'Markdown' });
    }
    return renderUserHistoryPage(ctx, targetUserId, 1, false);
  }

  return ctx.reply(
    '📜 *Search History*\n\nSelect a timeframe to view search logs:',
    {
      parse_mode: 'Markdown',
      ...getHistoryFilterKeyboard(),
    }
  );
});

// ─────────────────────────────────────────────
// COMMAND: /adduser (Admin only)
// ─────────────────────────────────────────────
bot.command('adduser', async (ctx) => {
  const userId = ctx.from?.id;
  if (userId !== ADMIN_ID) {
    return ctx.reply('🚫 Unauthorized. Only the administrator can run this command.');
  }

  const args = ctx.message.text.split(/\s+/);
  if (args.length < 2) {
    return ctx.reply('ℹ️ *Usage:* `/adduser <telegram_user_id>`', { parse_mode: 'Markdown' });
  }

  const targetId = parseInt(args[1], 10);
  if (isNaN(targetId)) {
    return ctx.reply('⚠️ Please provide a valid numeric Telegram User ID.');
  }

  const added = await addToWhitelist(targetId);
  if (added) {
    let notified = false;
    try {
      await ctx.telegram.sendMessage(
        targetId,
        '🎉 *Access Granted!*\n\nYou have been granted access to Resbot. You can now use the bot to search for student results.',
        { parse_mode: 'Markdown' }
      );
      notified = true;
    } catch (err) {
      console.error(`Failed to send welcome message to ${targetId}:`, err.message);
    }

    if (notified) {
      return ctx.reply(`✅ User \`${targetId}\` has been approved, added to the whitelist, and sent a welcome message.`, { parse_mode: 'Markdown' });
    } else {
      return ctx.reply(`✅ User \`${targetId}\` has been approved and added to the whitelist (could not send welcome message: user may not have started the bot).`, { parse_mode: 'Markdown' });
    }
  } else {
    return ctx.reply(`ℹ️ User \`${targetId}\` is already in the whitelist.`, { parse_mode: 'Markdown' });
  }
});

// ─────────────────────────────────────────────
// COMMAND: /rmuser (Admin only)
// ─────────────────────────────────────────────
bot.command('rmuser', async (ctx) => {
  const userId = ctx.from?.id;
  if (userId !== ADMIN_ID) {
    return ctx.reply('🚫 Unauthorized. Only the administrator can run this command.');
  }

  const args = ctx.message.text.split(/\s+/);
  if (args.length < 2) {
    return ctx.reply('ℹ️ *Usage:* `/rmuser <telegram_user_id>`', { parse_mode: 'Markdown' });
  }

  const targetId = parseInt(args[1], 10);
  if (isNaN(targetId)) {
    return ctx.reply('⚠️ Please provide a valid numeric Telegram User ID.');
  }

  const removed = await removeFromWhitelist(targetId);
  if (removed) {
    return ctx.reply(`✅ User \`${targetId}\` has been removed from the whitelist.`, { parse_mode: 'Markdown' });
  } else {
    return ctx.reply(`⚠️ User \`${targetId}\` was not found in the whitelist.`, { parse_mode: 'Markdown' });
  }
});

// ─────────────────────────────────────────────
// COMMAND: /showuser (Admin only)
// ─────────────────────────────────────────────
bot.command('showuser', async (ctx) => {
  const userId = ctx.from?.id;
  if (userId !== ADMIN_ID) {
    return ctx.reply('🚫 Unauthorized. Only the administrator can run this command.');
  }

  try {
    const list = await getWhitelist();
    if (list.length === 0) {
      return ctx.reply('📭 The whitelist is currently empty.');
    }

    const statusMsg = await ctx.reply('⏳ Fetching user details...');

    // Helper to run a promise with a timeout
    const withTimeout = (promise, ms) => {
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Timeout')), ms);
      });
      return Promise.race([
        promise.then((res) => {
          clearTimeout(timeoutId);
          return res;
        }),
        timeoutPromise
      ]);
    };

    // Fetch all user details in parallel
    const fetchPromises = list.map(async (id) => {
      try {
        // 3-second timeout per user fetch
        const chat = await withTimeout(ctx.telegram.getChat(id), 3000);
        const fullName = [chat.first_name, chat.last_name].filter(Boolean).join(' ');
        const usernameStr = chat.username ? ` @${chat.username}` : '';
        const escapeHTML = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `• <b>${escapeHTML(fullName)}</b>${escapeHTML(usernameStr)} (ID: <code>${id}</code>)`;
      } catch (err) {
        return `• <code>ID: ${id}</code> (Unable to fetch details)`;
      }
    });

    const userLines = await Promise.all(fetchPromises);
    const response = `👥 <b>Approved Users (Whitelist - Total: ${list.length}):</b>\n\n` + userLines.join('\n');

    // Delete the temporary status message and send the final list
    try {
      await ctx.deleteMessage(statusMsg.message_id);
    } catch (e) {
      // Ignore if we can't delete the status message
    }

    return ctx.reply(response, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('[Bot] Error in /showuser command:', err);
    return ctx.reply(`⚠️ Failed to retrieve user details: ${err.message}`);
  }
});

// ─────────────────────────────────────────────
// COMMAND: /exportdata (Admin only)
// ─────────────────────────────────────────────
bot.command('exportdata', async (ctx) => {
  const userId = ctx.from?.id;
  if (userId !== ADMIN_ID) {
    return ctx.reply('🚫 Unauthorized. Only the administrator can run this command.');
  }

  try {
    const fs = require('fs');
    const path = require('path');

    const whitelistPath = path.resolve(__dirname, '../whitelist.json');
    const dbPath = path.resolve(process.env.DB_PATH || './data/students.db');

    // Sync whitelist.json with current DB state before exporting
    try {
      const allowed_users = await getWhitelist();
      const backupObj = {
        _comment: "Add Telegram user IDs of people allowed to use the bot. Get IDs from @userinfobot.",
        allowed_users
      };
      fs.writeFileSync(whitelistPath, JSON.stringify(backupObj, null, 2), 'utf-8');
    } catch (writeErr) {
      console.error('[Export] Failed to sync whitelist.json from DB:', writeErr);
    }

    if (fs.existsSync(whitelistPath)) {
      await ctx.replyWithDocument({ source: whitelistPath, filename: 'whitelist.json' }, { caption: '📄 Whitelist backup (all allowed Telegram user IDs)' });
    } else {
      await ctx.reply('⚠️ whitelist.json not found on disk.');
    }

    if (fs.existsSync(dbPath)) {
      await ctx.replyWithDocument({ source: dbPath, filename: 'students.db' }, { caption: '📦 Search history & database backup' });
    } else {
      await ctx.reply('⚠️ students.db not found on disk.');
    }

  } catch (err) {
    console.error('[Bot] Error exporting data:', err);
    ctx.reply(`⚠️ Export failed: ${err.message}`);
  }
});

// ─────────────────────────────────────────────
// COMMAND: /announce (Admin only)
// ─────────────────────────────────────────────
bot.command('announce', async (ctx) => {
  const userId = ctx.from?.id;
  if (userId !== ADMIN_ID) {
    return ctx.reply('🚫 Unauthorized. Only the administrator can run this command.');
  }

  const messageText = ctx.message.text.substring('/announce'.length).trim();
  if (!messageText) {
    return ctx.reply('ℹ️ *Usage:* `/announce <your announcement message>`\n\n*Example:* `/announce Maintenance scheduled for tonight at 10 PM.`', { parse_mode: 'Markdown' });
  }

  const list = await getWhitelist();
  if (list.length === 0) {
    return ctx.reply('📭 Whitelist is empty.');
  }

  const statusMsg = await ctx.reply(`📢 Broadcast starting... Sending announcement to ${list.length} user(s).`);

  let successCount = 0;
  let failCount = 0;

  const escapeHTML = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const formattedMessage = `📢 <b>Announcement</b>\n\n${escapeHTML(messageText)}`;

  for (const targetId of list) {
    try {
      await ctx.telegram.sendMessage(targetId, formattedMessage, { parse_mode: 'HTML' });
      successCount++;
    } catch (err) {
      try {
        // Fallback plain text if HTML parsing fails for any reason
        await ctx.telegram.sendMessage(targetId, `📢 Announcement\n\n${messageText}`);
        successCount++;
      } catch (fallbackErr) {
        console.error(`[Announce] Failed to send message to user ${targetId}:`, fallbackErr.message);
        failCount++;
      }
    }
  }

  return ctx.reply(
    `✅ *Broadcast Complete!*\n\n` +
    `• Delivered: *${successCount}*\n` +
    `• Failed / Blocked: *${failCount}*`,
    { parse_mode: 'Markdown' }
  );
});

// ─────────────────────────────────────────────
// SPECIAL SCHOLAR NOTIFICATION HELPER
// ─────────────────────────────────────────────

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function notifyAdminIfSpecial(fromUser, student) {
  if (!ADMIN_ID || !student || !student.scholar_no) return;
  try {
    const isSpecial = await isSpecialScholar(student.scholar_no);
    if (!isSpecial) return;

    const history = await getHistoryByScholarNo(student.scholar_no);
    const userStr = fromUser.username ? `@${escapeHTML(fromUser.username)}` : `ID: <code>${fromUser.id}</code>`;
    const userName = fromUser.first_name ? escapeHTML(fromUser.first_name) : 'Unknown';
    const nowIST = formatTo12Hour(new Date());

    let text = `🚨 <b>SPECIAL SCHOLAR SEARCH DETECTED</b> 🚨\n\n` +
      `A tracked special scholar entry was searched!\n\n` +
      `👤 <b>Searched By:</b>\n` +
      `• <b>Name:</b> ${userName}\n` +
      `• <b>Username:</b> ${userStr}\n` +
      `• <b>User ID:</b> <code>${fromUser.id}</code>\n\n` +
      `🎓 <b>Student Details:</b>\n` +
      `• <b>Name:</b> ${escapeHTML(student.name)}\n` +
      `• <b>Scholar No:</b> <code>${escapeHTML(student.scholar_no)}</code>\n` +
      `• <b>Degree / Specialization:</b> ${escapeHTML(student.degree || 'N/A')} - ${escapeHTML(student.specialization || 'N/A')}\n\n` +
      `🕒 <b>Search Time:</b> ${nowIST}\n\n` +
      `📜 <b>Complete Search History for this Scholar (${history.length} total):</b>\n`;

    if (history.length === 0) {
      text += `<i>No search logs recorded yet.</i>`;
    } else {
      const historyLines = history.slice(0, 30).map((h, i) => {
        const uName = h.first_name ? escapeHTML(h.first_name) : 'User';
        const uHandle = h.username ? `@${escapeHTML(h.username)}` : `ID: <code>${h.user_id}</code>`;
        return `${i + 1}. <b>${uName}</b> (${uHandle}) — <i>${h.timestamp || ''}</i>`;
      });
      text += historyLines.join('\n');
      if (history.length > 30) {
        text += `\n<i>...and ${history.length - 30} more older search logs.</i>`;
      }
    }

    await bot.telegram.sendMessage(ADMIN_ID, text, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('[Special] Failed to notify admin of special search:', err.message);
  }
}

// ─────────────────────────────────────────────
// COMMAND: /special or /speical (Admin only)
// ─────────────────────────────────────────────
bot.command(['special', 'speical'], async (ctx) => {
  const userId = ctx.from?.id;
  if (userId !== ADMIN_ID) {
    return ctx.reply('🚫 Unauthorized. Only the administrator can run this command.');
  }

  const args = ctx.message.text.split(/\s+/);
  if (args.length < 2) {
    return ctx.reply('ℹ️ *Usage:* `/special <scholar_number>`\n\n*Example:* `/special 25U020130`', { parse_mode: 'Markdown' });
  }

  const scholarNo = args[1].trim().toUpperCase();
  const student = await getByScholarNo(scholarNo);
  const added = await addSpecialScholar(scholarNo);
  const studentInfo = student ? ` (${student.name})` : '';

  if (added) {
    return ctx.reply(
      `✅ Scholar number \`${scholarNo}\`${studentInfo} added to special tracking list.\n\n` +
      `Whenever someone searches for this student, you will receive an instant alert with the full search history.`,
      { parse_mode: 'Markdown' }
    );
  } else {
    return ctx.reply(`ℹ️ Scholar number \`${scholarNo}\`${studentInfo} is already in the special tracking list.`, { parse_mode: 'Markdown' });
  }
});

// ─────────────────────────────────────────────
// COMMAND: /rmspecial (Admin only)
// ─────────────────────────────────────────────
bot.command(['rmspecial', 'delspecial'], async (ctx) => {
  const userId = ctx.from?.id;
  if (userId !== ADMIN_ID) {
    return ctx.reply('🚫 Unauthorized. Only the administrator can run this command.');
  }

  const args = ctx.message.text.split(/\s+/);
  if (args.length < 2) {
    return ctx.reply('ℹ️ *Usage:* `/rmspecial <scholar_number>`', { parse_mode: 'Markdown' });
  }

  const scholarNo = args[1].trim().toUpperCase();
  const removed = await removeSpecialScholar(scholarNo);
  if (removed) {
    return ctx.reply(`✅ Scholar number \`${scholarNo}\` removed from special tracking list.`, { parse_mode: 'Markdown' });
  } else {
    return ctx.reply(`⚠️ Scholar number \`${scholarNo}\` was not found in the special tracking list.`, { parse_mode: 'Markdown' });
  }
});

// ─────────────────────────────────────────────
// COMMAND: /showspecial (Admin only)
// ─────────────────────────────────────────────
bot.command(['showspecial', 'listspecial'], async (ctx) => {
  const userId = ctx.from?.id;
  if (userId !== ADMIN_ID) {
    return ctx.reply('🚫 Unauthorized. Only the administrator can run this command.');
  }

  try {
    const list = await getSpecialScholars();
    if (list.length === 0) {
      return ctx.reply('📭 No special scholar numbers are currently being tracked.');
    }

    let response = `⭐ <b>Tracked Special Scholar Numbers (${list.length}):</b>\n\n`;
    for (const item of list) {
      const student = await getByScholarNo(item.scholar_no);
      const studentName = student ? ` - <i>${escapeHTML(student.name)}</i>` : '';
      response += `• <code>${escapeHTML(item.scholar_no)}</code>${studentName} (added: ${item.added_at})\n`;
    }

    return ctx.reply(response, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('[Bot] Error in /showspecial command:', err);
    return ctx.reply(`⚠️ Failed to retrieve special list: ${err.message}`);
  }
});

// ─────────────────────────────────────────────
// COMMAND: /reloadreg (Admin only)
// ─────────────────────────────────────────────

bot.command('reloadreg', async (ctx) => {
  const userId = ctx.from?.id;
  if (!isAdmin(userId)) {
    return ctx.reply('🚫 You are not authorized to use this command.');
  }

  try {
    const cache = loadRegistrationData(true);
    return ctx.reply(`✅ Registration data reloaded successfully.\nTotal students: <b>${cache.size}</b>`, {
      parse_mode: 'HTML'
    });
  } catch (err) {
    return ctx.reply(`⚠️ Failed to reload registration data: ${err.message}`);
  }
});

// ─────────────────────────────────────────────
// COMMAND: /ai (Natural Language Query)
// ─────────────────────────────────────────────

bot.command('ai', async (ctx) => {
  const query = ctx.message.text.replace(/^\/ai(@\w+)?\s*/i, '').trim();
  const userId = ctx.from?.id;

  if (!query) {
    const remaining = getRemainingDailyQueries(userId);
    return ctx.reply(
      `🤖 *AI Academic Query*\n\n` +
      `Ask aggregate and comparative questions across student records and batches\\.\n\n` +
      `*Usage:*\n\`/ai <your question>\`\n\n` +
      `*Examples:*\n` +
      `• \`/ai who topped 2nd sem in ece-28?\`\n` +
      `• \`/ai what is the average CPI of ece-28?\`\n` +
      `• \`/ai how many students failed sem 2 in ece-28?\`\n` +
      `• \`/ai list all students in ece-28\`\n\n` +
      `_💡 You have *${remaining}/10* daily queries remaining today\\._`,
      { parse_mode: 'MarkdownV2' }
    );
  }

  return handleNLQ(ctx, query);
});

// ─────────────────────────────────────────────
// COMMAND: /nlq_debug (Admin only)
// ─────────────────────────────────────────────

bot.command('nlq_debug', async (ctx) => {
  const userId = ctx.from?.id;
  if (!isAdmin(userId)) {
    return ctx.reply('🚫 You are not authorized to use this command.');
  }
  const raw = ctx.message.text.replace(/^\/nlq_debug\s*/, '').trim();
  if (!raw) {
    return ctx.reply('Usage: /nlq_debug {"intent": "TOP_SCORER", "params": {"batch": "ece-28", "semester": 2, "metric": "spi"}, "confidence": "high"}');
  }
  return handleDebugIntent(ctx, raw);
});

// ─────────────────────────────────────────────
// COMMAND: /feedback (Admin Review of Unrated AI Queries)
// ─────────────────────────────────────────────

async function renderFeedbackCard(ctx, page = 1, isEdit = false) {
  const { results, total } = await getUnratedAiQueries(page, 1);
  if (total === 0 || results.length === 0) {
    const text = '🎉 <b>No Unrated AI Questions</b>\n\nAll AI questions in history have been rated by the admin.';
    if (isEdit) {
      try {
        return await ctx.editMessageText(text, { parse_mode: 'HTML' });
      } catch {}
    }
    return ctx.reply(text, { parse_mode: 'HTML' });
  }

  const q = results[0];
  const totalPages = total;
  const status = q.is_answered
    ? `✅ Answered (Intent: <code>${escapeHTML(q.intent || 'N/A')}</code>)`
    : `❌ Rejected: <code>${escapeHTML(q.rejection_reason || 'Unanswerable')}</code>`;

  const userDisplay = q.username
    ? `@${escapeHTML(q.username)} (<code>${q.user_id}</code>)`
    : `${escapeHTML(q.first_name || 'User')} (<code>${q.user_id}</code>)`;

  const text =
    `🤖 <b>Unrated AI Query (${page} of ${totalPages})</b>\n\n` +
    `🆔 <b>ID:</b> <code>#${q.id}</code>\n` +
    `👤 <b>User:</b> ${userDisplay}\n` +
    `❓ <b>Question:</b> "<i>${escapeHTML(q.query_text)}</i>"\n` +
    `📊 <b>Bot Response:</b> ${status}\n` +
    `⏰ <b>Timestamp:</b> <i>${escapeHTML(q.timestamp || '')}</i>\n\n` +
    `<i>Rate this query or teach the model the correct intent:</i>`;

  const buttons = [
    [
      Markup.button.callback('👍 Good', `fb_rate:${q.id}:good:${page}`),
      Markup.button.callback('👎 Bad / Correct', `fb_rate:${q.id}:bad:${page}`)
    ]
  ];

  const navRow = [];
  if (page > 1) {
    navRow.push(Markup.button.callback('⬅️ Prev', `fb_nav:${page - 1}`));
  }
  navRow.push(Markup.button.callback(`${page}/${totalPages}`, 'noop'));
  if (page < totalPages) {
    navRow.push(Markup.button.callback('Next ➡️', `fb_nav:${page + 1}`));
  }
  buttons.push(navRow);
  buttons.push([Markup.button.callback('❌ Close', 'fb_close')]);

  const extra = {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  };

  if (isEdit) {
    try {
      return await ctx.editMessageText(text, extra);
    } catch {}
  }
  return ctx.reply(text, extra);
}

bot.command('feedback', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) {
    return ctx.reply('🚫 Access Denied. Only administrators can use /feedback.');
  }
  try {
    await renderFeedbackCard(ctx, 1, false);
  } catch (err) {
    console.error('[Bot] Error showing feedback card:', err);
    ctx.reply('❌ An error occurred while retrieving unrated questions.');
  }
});

// ─────────────────────────────────────────────
// QUERY CACHE FOR PAGINATION
// ─────────────────────────────────────────────
const queryCache = new Map();
let queryIdCounter = 0;

function saveQuery(query) {
  const id = `q${++queryIdCounter}`;
  queryCache.set(id, query);
  if (queryCache.size > 1000) {
    const firstKey = queryCache.keys().next().value;
    queryCache.delete(firstKey);
  }
  return id;
}

// ─────────────────────────────────────────────
// KEYBOARD BUTTON HANDLERS
// ─────────────────────────────────────────────

bot.hears(['🔍 Search Guide', '🔍 Search Help', 'Search Guide'], async (ctx) => {
  adminStates.delete(ctx.from?.id);
  const menu = getMainMenu(ctx.from?.id);
  return ctx.reply(
    `🔍 *Student Search Guide*\n\n` +
    `*1. Search by Scholar Number*\n` +
    `Send any valid scholar number directly in chat:\n` +
    `↳ \`25U020130\`\n` +
    `↳ \`23U010045\`\n\n` +
    `*2. Search by Student Name*\n` +
    `Type a student's first, last, or partial name:\n` +
    `↳ \`Anubhav\`\n` +
    `↳ \`Sharma\`\n\n` +
    `*3. AI Natural Language Query*\n` +
    `Ask questions across branches and semesters using \`/ai <query>\` or the *🤖 AI Academic Search* button:\n` +
    `↳ \`/ai who topped 2nd sem in ece-28?\`\n` +
    `↳ \`/ai average CPI of cse-26\`\n` +
    `↳ \`/ai how many students failed in it-27?\`\n\n` +
    `_Tip: Simply type your search query anytime!_`,
    {
      parse_mode: 'Markdown',
      ...menu
    }
  );
});

bot.hears(['🤖 AI Search', '🤖 AI Academic Search', 'AI Search', 'AI Academic Search'], async (ctx) => {
  const userId = ctx.from?.id;
  const remaining = getRemainingDailyQueries(userId);

  adminStates.set(ctx.from.id, { state: 'AWAITING_AI_QUERY' });

  return ctx.reply(
    `🤖 <b>AI Academic Query</b>\n\n` +
    `Ask aggregate or comparative questions across batches, branches, or semesters.\n\n` +
    `<b>Examples:</b>\n` +
    `• <i>who topped 2nd sem in ece-28?</i>\n` +
    `• <i>average CPI of cse-26</i>\n` +
    `• <i>how many students failed sem 2 in ece-28?</i>\n` +
    `• <i>list all students in ece-28</i>\n\n` +
    `💬 <b>Type and send your question below</b> (or use <code>/ai &lt;query&gt;</code>):\n\n` +
    `<i>💡 You have <b>${remaining}/10</b> daily queries remaining today. Send /cancel to abort.</i>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'action_cancel')]])
    }
  );
});

bot.hears(['❓ Help', '❓ Help & Guide', 'Help', 'Help & Guide'], (ctx) => {
  adminStates.delete(ctx.from?.id);
  const menu = getMainMenu(ctx.from?.id);
  const adminHelp = isAdmin(ctx.from?.id)
    ? `\n\n*Admin Interactive Keyboard:*\n` +
      `• 👤 *Share / Add User* — Pick a contact to approve\n` +
      `• 👥 *Whitelisted Users* — Manage whitelisted users\n` +
      `• 📜 *Search History* — Filter logs & AI question history\n` +
      `• ⭐ *Special Scholars* — Track VIP scholar searches\n` +
      `• 🤖 *AI Search* — Query academic records with AI\n` +
      `• 📝 *AI Feedback* — Review & correct AI intents\n` +
      `• 📢 *Broadcast Announcement* — Send broadcast with preview\n` +
      `• 📊 *Export Data* — Export search logs to Excel\n` +
      `• 🔄 *Reload Reg Data* — Refresh student cache\n` +
      `• /nlq_debug <json> — Test NLQ intent parsing`
    : `\n\n*Commands:*\n• /menu - Activate keyboard buttons\n• /hidemenu - Deactivate keyboard buttons`;

  ctx.reply(
    `📖 *How to use this bot*\n\n` +
    `*Search by Scholar Number:*\n` +
    `Send the exact scholar number.\n` +
    `Example: \`25U020130\`\n\n` +
    `*Search by Name:*\n` +
    `Send a partial or full name.\n` +
    `Example: \`Anubhav\`\n\n` +
    `*AI Natural Language Query:*\n` +
    `Ask academic questions using \`/ai <question>\` or the *🤖 AI Academic Search* button\\.\n` +
    `Example: \`/ai who topped 2nd sem in ece-28?\`\n\n` +
    `If multiple students match, you'll get a list to choose from.\n\n` +
    `_Rate limit: 10 queries per minute._` +
    adminHelp,
    {
      parse_mode: 'Markdown',
      ...menu
    }
  );
});

bot.hears(['❌ Hide Menu', '❌ Close Menu', 'Hide Menu'], async (ctx) => {
  adminStates.delete(ctx.from?.id);
  return ctx.reply('⌨️ Keyboard buttons have been deactivated. Send /menu anytime to bring them back.', Markup.removeKeyboard());
});

bot.hears(['📜 Search History', '📜 History', 'Search History', 'History'], async (ctx) => {
  adminStates.delete(ctx.from?.id);
  if (!isAdmin(ctx.from?.id)) {
    return ctx.reply('🚫 Unauthorized. Only administrators can view search history.');
  }
  return ctx.reply(
    '📜 *Search History*\n\nSelect a timeframe to view search logs:',
    {
      parse_mode: 'Markdown',
      ...getHistoryFilterKeyboard(),
    }
  );
});

bot.hears(['📝 AI Feedback', '🎯 AI Feedback', 'AI Feedback', 'Feedback'], async (ctx) => {
  adminStates.delete(ctx.from?.id);
  if (!isAdmin(ctx.from?.id)) {
    return ctx.reply('🚫 Access Denied. Only administrators can use AI Feedback.');
  }
  try {
    await renderFeedbackCard(ctx, 1, false);
  } catch (err) {
    console.error('[Bot] Error showing feedback card:', err);
    ctx.reply('❌ An error occurred while retrieving unrated questions.');
  }
});

bot.hears(['📢 Broadcast Announcement', '📢 Announce', 'Broadcast Announcement', 'Announce'], async (ctx) => {
  if (!isAdmin(ctx.from?.id)) {
    return ctx.reply('🚫 Unauthorized.');
  }
  adminStates.set(ctx.from.id, { state: 'AWAITING_ANNOUNCEMENT' });
  return ctx.reply(
    '📢 <b>Broadcast Announcement</b>\n\n' +
    'Please type and send the message you want to broadcast to all whitelisted users.\n\n' +
    '<i>You will receive an interactive preview card with a 1-click confirmation button before any message is sent.</i>\n\n' +
    '<i>Send /cancel or tap Cancel below to abort.</i>',
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'action_cancel')]])
    }
  );
});

// ─────────────────────────────────────────────
// INTERACTIVE ADMIN STATE & HELPERS
// ─────────────────────────────────────────────

const adminStates = new Map(); // userId -> { state: string, ...data }

async function getStudentAdminKeyboard(scholarNo) {
  const isSpecial = await isSpecialScholar(scholarNo);
  const btn = isSpecial
    ? Markup.button.callback('⭐ Stop Tracking Scholar', `special_rm:${scholarNo}`)
    : Markup.button.callback('⭐ Track as Special Scholar', `special_add:${scholarNo}`);
  return Markup.inlineKeyboard([[btn]]);
}

async function renderSpecialScholarsMessage(ctx, isEdit = false) {
  try {
    const list = await getSpecialScholars();
    let text = `⭐ <b>Tracked Special Scholars (${list.length})</b>\n\n`;

    if (list.length === 0) {
      text += '<i>No special scholars are currently tracked.</i>\n\nTap below to track a student:';
    } else {
      for (const item of list) {
        const student = await getByScholarNo(item.scholar_no);
        const studentName = student ? ` - <i>${escapeHTML(student.name)}</i>` : '';
        text += `• <code>${escapeHTML(item.scholar_no)}</code>${studentName}\n`;
      }
    }

    const inlineButtons = [
      [
        Markup.button.callback('➕ Track New Scholar', 'special_btn_add'),
        ...(list.length > 0 ? [Markup.button.callback('➖ Untrack a Scholar', 'special_btn_rm_menu')] : [])
      ],
      [Markup.button.callback('🔄 Refresh', 'special_btn_refresh')]
    ];

    const extra = {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(inlineButtons)
    };

    if (isEdit) {
      return ctx.editMessageText(text, extra).catch(() => { });
    } else {
      return ctx.reply(text, extra);
    }
  } catch (err) {
    console.error('[Bot] Error in Special Scholars message:', err);
    return ctx.reply(`⚠️ Failed to retrieve special list: ${err.message}`);
  }
}

async function renderWhitelistedUsersMessage(ctx, isEdit = false) {
  try {
    const list = await getWhitelist();
    let text = `👥 <b>Approved Whitelisted Users (${list.length})</b>\n\n`;

    if (list.length === 0) {
      text += '<i>The whitelist is currently empty.</i>';
    } else {
      const fetchPromises = list.map(async (id) => {
        try {
          const chat = await ctx.telegram.getChat(id);
          const fullName = [chat.first_name, chat.last_name].filter(Boolean).join(' ');
          const usernameStr = chat.username ? ` (@${escapeHTML(chat.username)})` : '';
          return `• <b>${escapeHTML(fullName || 'User')}</b>${usernameStr} — <code>${id}</code>`;
        } catch (err) {
          return `• User ID: <code>${id}</code>`;
        }
      });
      const lines = await Promise.all(fetchPromises);
      text += lines.join('\n');
    }

    const inlineButtons = [
      [
        Markup.button.callback('➕ Add by ID', 'whitelist_btn_add'),
        ...(list.length > 0 ? [Markup.button.callback('➖ Remove a User', 'whitelist_btn_rm_menu')] : [])
      ],
      [Markup.button.callback('🔄 Refresh', 'whitelist_btn_refresh')]
    ];

    const extra = {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(inlineButtons)
    };

    if (isEdit) {
      return ctx.editMessageText(text, extra).catch(() => { });
    } else {
      return ctx.reply(text, extra);
    }
  } catch (err) {
    console.error('[Bot] Error in Whitelisted Users message:', err);
    return ctx.reply(`⚠️ Failed to retrieve user details: ${err.message}`);
  }
}

// ─────────────────────────────────────────────
// SHARED PROFILE HANDLER (From "👤 Share / Add User" button)
// ─────────────────────────────────────────────

bot.on(['user_shared', 'users_shared'], async (ctx) => {
  const userId = ctx.from?.id;
  if (!isAdmin(userId)) return;

  const shared = ctx.message.user_shared || ctx.message.users_shared;
  const targetId = shared?.user_id || shared?.user_ids?.[0];
  if (!targetId) return;

  let nameInfo = '';
  try {
    const chat = await ctx.telegram.getChat(targetId);
    const fullName = [chat.first_name, chat.last_name].filter(Boolean).join(' ');
    const usernameStr = chat.username ? ` (@${escapeHTML(chat.username)})` : '';
    if (fullName) nameInfo = `\nName: <b>${escapeHTML(fullName)}</b>${usernameStr}`;
  } catch (e) { }

  const isWhitelisted = await isAllowed(targetId);

  const buttons = [
    [
      isWhitelisted
        ? Markup.button.callback('➖ Remove from Whitelist', `whitelist_rm:${targetId}`)
        : Markup.button.callback('👥 Add to Whitelist', `whitelist_add:${targetId}`)
    ],
    [
      Markup.button.callback('📜 View Search History', `his_usr:${targetId}:1`)
    ],
    [
      Markup.button.callback('❌ Cancel', 'action_cancel')
    ]
  ];

  return ctx.reply(
    `👤 <b>Shared Profile</b>\n` +
    `User ID: <code>${targetId}</code>${nameInfo}\n` +
    `Status: ${isWhitelisted ? '✅ Whitelisted' : '❌ Not Whitelisted'}\n\n` +
    `Choose an action:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    }
  );
});

bot.hears(['⭐ Special Scholars', 'Special Scholars'], async (ctx) => {
  adminStates.delete(ctx.from?.id);
  if (!isAdmin(ctx.from?.id)) {
    return ctx.reply('🚫 Unauthorized. Only administrators can view special scholars.');
  }
  return renderSpecialScholarsMessage(ctx, false);
});

bot.hears(['👥 Whitelisted Users', 'Whitelisted Users'], async (ctx) => {
  adminStates.delete(ctx.from?.id);
  if (!isAdmin(ctx.from?.id)) {
    return ctx.reply('🚫 Unauthorized. Only administrators can view users.');
  }
  return renderWhitelistedUsersMessage(ctx, false);
});

bot.hears(['📊 Export Data', 'Export Data'], async (ctx) => {
  adminStates.delete(ctx.from?.id);
  if (!isAdmin(ctx.from?.id)) {
    return ctx.reply('🚫 Unauthorized.');
  }
  try {
    const history = await getAllSearchHistory();
    if (history.length === 0) {
      return ctx.reply('📭 No search history available to export.');
    }

    const statusMsg = await ctx.reply('⏳ Generating export file...');
    const XLSX = require('xlsx');
    const exportRows = history.map(h => ({
      'User ID': h.user_id,
      'Username': h.username ? `@${h.username}` : 'N/A',
      'Name': h.first_name || 'N/A',
      'Scholar No': h.scholar_no,
      'Student Name': h.student_name,
      'Timestamp': h.timestamp
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Search History');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const now = new Date();
    const filename = `search_history_${now.toISOString().split('T')[0]}.xlsx`;

    try {
      await ctx.deleteMessage(statusMsg.message_id);
    } catch (e) { }

    return ctx.replyWithDocument({
      source: buffer,
      filename
    }, {
      caption: `📊 <b>Search History Export</b>\nTotal Records: <b>${history.length}</b>`,
      parse_mode: 'HTML'
    });
  } catch (err) {
    console.error('[Bot] Error in Export Data button:', err);
    return ctx.reply(`⚠️ Failed to export data: ${err.message}`);
  }
});

bot.hears(['🔄 Reload Reg Data', 'Reload Reg Data'], async (ctx) => {
  adminStates.delete(ctx.from?.id);
  if (!isAdmin(ctx.from?.id)) {
    return ctx.reply('🚫 Unauthorized.');
  }
  try {
    const cache = loadRegistrationData(true);
    return ctx.reply(`✅ Registration data reloaded successfully.\nTotal unique students: <b>${cache.size}</b>`, {
      parse_mode: 'HTML'
    });
  } catch (err) {
    return ctx.reply(`⚠️ Failed to reload registration data: ${err.message}`);
  }
});

// ─────────────────────────────────────────────
// TEXT HANDLER: Main query logic
// ─────────────────────────────────────────────

bot.on('text', async (ctx) => {
  const input = ctx.message.text.trim();

  // Cancel any active prompt
  if (input === '/cancel') {
    if (adminStates.has(ctx.from?.id)) {
      adminStates.delete(ctx.from?.id);
      return ctx.reply('❌ Action cancelled.');
    }
  }

  // Handle interactive states (AI query or Admin actions)
  const state = adminStates.get(ctx.from?.id);
  if (state) {
    if (state.state === 'AWAITING_AI_QUERY') {
      adminStates.delete(ctx.from.id);
      const cleanQuery = input.replace(/^\/ai(@\w+)?\s*/i, '').trim();
      if (!cleanQuery) {
        return ctx.reply('⚠️ Please provide a query to ask the AI.');
      }
      return handleNLQ(ctx, cleanQuery);
    }

    if (isAdmin(ctx.from?.id)) {
      if (state.state === 'AWAITING_CORRECT_INTENT') {
        const parseResult = await parseCorrectionInput(input);
        if (!parseResult.success) {
          return ctx.reply(
            `⚠️ <b>Could not parse correction:</b>\n${escapeHTML(parseResult.error)}\n\n` +
            `Try one of:\n` +
            `• <code>unsupported</code>\n` +
            `• <code>topper cse-26 sem 2 spi</code>\n` +
            `• <code>avg cpi it-28</code>\n` +
            `• <code>lookup 25U020130</code>\n` +
            `• <i>Or send /cancel</i>`,
            { parse_mode: 'HTML' }
          );
        }

        adminStates.delete(ctx.from.id);
        try {
          await addFeedbackCorrection(state.queryText, state.wrongOutput, parseResult.intentJson);
          await ctx.reply(
            `✅ <b>Correction Saved to Knowledge Base!</b>\n\n` +
            `❓ <b>Query:</b> "<i>${escapeHTML(state.queryText)}</i>"\n` +
            `🎯 <b>Saved Intent:</b> <pre>${escapeHTML(parseResult.intentJson)}</pre>\n\n` +
            `<i>This correction has been embedded with pgvector and will dynamically guide future queries.</i>\n\n` +
            `Loading next unrated query...`,
            { parse_mode: 'HTML' }
          );
          return renderFeedbackCard(ctx, state.page || 1, false);
        } catch (err) {
          console.error('[Feedback] Error saving correction:', err);
          return ctx.reply('❌ Failed to save correction: ' + err.message);
        }
      }

      if (state.state === 'AWAITING_ANNOUNCEMENT') {
        const list = await getWhitelist();
        adminStates.set(ctx.from.id, {
          state: 'CONFIRM_ANNOUNCEMENT',
          text: input,
          recipients: list
        });

        return ctx.reply(
          `📢 <b>Announcement Preview:</b>\n\n${escapeHTML(input)}\n\n` +
          `<i>Target: <b>${list.length}</b> whitelisted user(s).</i>\n\nReady to broadcast?`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback(`🚀 Broadcast to ${list.length} Users`, 'announce_confirm')],
              [Markup.button.callback('❌ Cancel', 'action_cancel')]
            ])
          }
        );
      }

      if (state.state === 'AWAITING_SPECIAL_SCHOLAR') {
        adminStates.delete(ctx.from.id);
        const scholarNo = input.toUpperCase();
        const student = await getByScholarNo(scholarNo);
        const added = await addSpecialScholar(scholarNo);
        const studentInfo = student ? ` (${escapeHTML(student.name)})` : '';

        return ctx.reply(
          added
            ? `✅ Scholar <code>${escapeHTML(scholarNo)}</code>${studentInfo} added to special tracking list!`
            : `ℹ️ Scholar <code>${escapeHTML(scholarNo)}</code>${studentInfo} is already tracked.`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('⭐ View Special Scholars', 'special_btn_refresh')]
            ])
          }
        );
      }

      if (state.state === 'AWAITING_ADD_USER') {
        adminStates.delete(ctx.from.id);
        const targetId = parseInt(input, 10);
        if (isNaN(targetId)) {
          return ctx.reply('⚠️ Please provide a valid numeric Telegram User ID.');
        }
        const added = await addToWhitelist(targetId);
        if (added) {
          try {
            await ctx.telegram.sendMessage(
              targetId,
              '🎉 *Access Granted!*\n\nYou have been granted access to Resbot. You can now use the bot to search for student results.',
              { parse_mode: 'Markdown' }
            );
          } catch (e) { }
        }
        return ctx.reply(
          added
            ? `✅ User <code>${targetId}</code> approved and added to whitelist!`
            : `ℹ️ User <code>${targetId}</code> is already in whitelist.`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('👥 View Whitelist', 'whitelist_btn_refresh')]
            ])
          }
        );
      }
    }
  }

  // Ignore commands that aren't explicitly handled
  if (input.startsWith('/')) return;

  // Ignore keyboard button labels to prevent treating them as search queries
  const buttonLabels = [
    '🔍 Search Guide', '🔍 Search Help', 'Search Guide',
    '🤖 AI Search', '🤖 AI Academic Search', 'AI Search', 'AI Academic Search',
    '❓ Help', '❓ Help & Guide', 'Help', 'Help & Guide',
    '❌ Hide Menu', '❌ Close Menu', 'Hide Menu',
    '👤 Share / Add User', 'Share / Add User',
    '👥 Whitelisted Users', 'Whitelisted Users',
    '📜 Search History', '📜 History', 'Search History', 'History',
    '⭐ Special Scholars', 'Special Scholars',
    '📝 AI Feedback', '🎯 AI Feedback', 'AI Feedback', 'Feedback',
    '📢 Broadcast Announcement', '📢 Announce', 'Broadcast Announcement', 'Announce',
    '📊 Export Data', 'Export Data',
    '🔄 Reload Reg Data', 'Reload Reg Data'
  ];
  if (buttonLabels.includes(input)) return;

  try {
    // ── Scholar Number Lookup ──
    if (isScholarNumber(input)) {
      const student = await getByScholarNo(input);

      if (!student) {
        if (isAdmin(ctx.from?.id)) {
          const reg = getRegistrationByScholarNo(input);
          if (reg) {
            return ctx.reply(formatRegistrationOnly(reg), {
              parse_mode: 'MarkdownV2',
              ...getMainMenu(ctx.from?.id)
            });
          }
        }
        return ctx.reply(`❌ No student found with scholar number: *${input}*`, {
          parse_mode: 'Markdown',
          ...getMainMenu(ctx.from?.id)
        });
      }

      await logSearch(ctx.from, student);
      notifyAdminIfSpecial(ctx.from, student);

      const reg = isAdmin(ctx.from?.id) ? getRegistrationByScholarNo(student.scholar_no) : null;
      const adminKeyboard = isAdmin(ctx.from?.id) ? await getStudentAdminKeyboard(student.scholar_no) : null;
      return ctx.reply(formatStudent(student, reg), {
        parse_mode: 'MarkdownV2',
        ...(adminKeyboard || {})
      });
    }

    // ── Name Search ──
    const isUserAdmin = isAdmin(ctx.from?.id);
    const { results, total } = await searchUnifiedStudents(input, 1, 10, isUserAdmin);

    if (total === 0) {
      return ctx.reply(`❌ No students found matching: *${input}*`, {
        parse_mode: 'Markdown',
        ...getMainMenu(ctx.from?.id)
      });
    }

    if (total === 1 && results.length === 1) {
      const match = results[0];
      if (match.isRegistrationOnly) {
        return ctx.reply(formatRegistrationOnly(match.regData || getRegistrationByScholarNo(match.scholar_no)), {
          parse_mode: 'MarkdownV2',
          ...getMainMenu(ctx.from?.id)
        });
      }

      const student = await getByScholarNo(match.scholar_no);
      if (!student) {
        if (isUserAdmin) {
          const reg = getRegistrationByScholarNo(match.scholar_no);
          if (reg) {
            return ctx.reply(formatRegistrationOnly(reg), {
              parse_mode: 'MarkdownV2',
              ...getMainMenu(ctx.from?.id)
            });
          }
        }
        return ctx.reply(`❌ No student found matching: *${input}*`, {
          parse_mode: 'Markdown',
          ...getMainMenu(ctx.from?.id)
        });
      }

      await logSearch(ctx.from, student);
      notifyAdminIfSpecial(ctx.from, student);

      const reg = isUserAdmin ? getRegistrationByScholarNo(student.scholar_no) : null;
      const adminKeyboard = isUserAdmin ? await getStudentAdminKeyboard(student.scholar_no) : null;
      return ctx.reply(formatStudent(student, reg), {
        parse_mode: 'MarkdownV2',
        ...(adminKeyboard || {})
      });
    }

    // Save query in cache for pagination
    const queryId = saveQuery(input);

    // Multiple results → inline keyboard (show first page)
    const buttons = results.map((s) =>
      [Markup.button.callback(
        `${s.name} (${s.scholar_no})`,
        `select:${s.scholar_no}`
      )]
    );

    // Add navigation buttons if total > 10
    const totalPages = Math.ceil(total / 10);
    if (totalPages > 1) {
      const navRow = [];
      navRow.push(Markup.button.callback(`1/${totalPages}`, 'noop'));
      navRow.push(Markup.button.callback('Next ➡️', `page:2:${queryId}`));
      buttons.push(navRow);
    }

    return ctx.reply(
      `🔍 Found *${total}* students matching "*${escape(input)}*"\\. Select one:`,
      {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(buttons),
      }
    );

  } catch (err) {
    console.error('[Bot] Error handling message:', err);
    ctx.reply('⚠️ Something went wrong. Please try again.');

    // Notify admin
    if (ADMIN_ID) {
      bot.telegram.sendMessage(
        ADMIN_ID,
        `⚠️ Error from user ${ctx.from.id} (${ctx.from.username || 'unknown'}):\n${err.message}`
      ).catch(() => { });
    }
  }
});

// ─────────────────────────────────────────────
// CALLBACK HANDLER: Inline button clicks
// ─────────────────────────────────────────────

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (!data) return;

  if (data === 'noop') {
    return ctx.answerCbQuery().catch(() => { });
  }

  // ── Handle student selection ──
  if (data.startsWith('select:')) {
    const scholarNo = data.replace('select:', '');

    try {
      const student = await getByCallback(scholarNo);

      if (!student) {
        if (isAdmin(ctx.from?.id)) {
          const reg = getRegistrationByScholarNo(scholarNo);
          if (reg) {
            await ctx.answerCbQuery();
            return ctx.reply(formatRegistrationOnly(reg), { parse_mode: 'MarkdownV2' });
          }
        }
        await ctx.answerCbQuery('Student not found.');
        return ctx.reply('❌ Could not find that student record.');
      }

      await logSearch(ctx.from, student);
      notifyAdminIfSpecial(ctx.from, student);

      await ctx.answerCbQuery(); // Dismiss loading spinner on button
      const reg = isAdmin(ctx.from?.id) ? getRegistrationByScholarNo(student.scholar_no) : null;
      const adminKeyboard = isAdmin(ctx.from?.id) ? await getStudentAdminKeyboard(student.scholar_no) : null;
      await ctx.reply(formatStudent(student, reg), {
        parse_mode: 'MarkdownV2',
        ...(adminKeyboard || {})
      });

    } catch (err) {
      console.error('[Bot] Error handling callback:', err);
      await ctx.answerCbQuery('Error fetching data.');
    }
    return;
  }

  // ── Action Cancel ──
  if (data === 'action_cancel') {
    adminStates.delete(ctx.from?.id);
    await ctx.answerCbQuery('Cancelled.');
    return ctx.editMessageText('❌ Action cancelled.').catch(() => { });
  }

  // ── Announce Confirm Broadcast ──
  if (data === 'announce_confirm') {
    if (!isAdmin(ctx.from?.id)) {
      return ctx.answerCbQuery('🚫 Admin only.');
    }
    const state = adminStates.get(ctx.from?.id);
    if (!state || state.state !== 'CONFIRM_ANNOUNCEMENT') {
      return ctx.answerCbQuery('⚠️ No pending announcement.');
    }
    adminStates.delete(ctx.from.id);
    await ctx.answerCbQuery('Broadcasting...');
    await ctx.editMessageText('⏳ Sending announcement to all whitelisted users...');

    const list = state.recipients || (await getWhitelist());
    let successCount = 0;
    let failCount = 0;
    const formatted = `📢 <b>Announcement</b>\n\n${escapeHTML(state.text)}`;

    for (const targetId of list) {
      try {
        await ctx.telegram.sendMessage(targetId, formatted, { parse_mode: 'HTML' });
        successCount++;
      } catch (err) {
        try {
          await ctx.telegram.sendMessage(targetId, `📢 Announcement\n\n${state.text}`);
          successCount++;
        } catch (e) {
          failCount++;
        }
      }
    }

    return ctx.reply(
      `✅ <b>Broadcast Complete!</b>\n\n` +
      `• Delivered: <b>${successCount}</b>\n` +
      `• Failed / Blocked: <b>${failCount}</b>`,
      { parse_mode: 'HTML' }
    );
  }

  // ── Special Scholars Callbacks ──
  if (data === 'special_btn_add') {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery('🚫 Admin only.');
    adminStates.set(ctx.from.id, { state: 'AWAITING_SPECIAL_SCHOLAR' });
    await ctx.answerCbQuery();
    return ctx.reply(
      '⭐ <b>Track New Special Scholar</b>\n\nPlease type and send the <b>Scholar Number</b> to track (e.g. <code>25U020130</code>):\n\n<i>Tap Cancel below to abort.</i>',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'action_cancel')]])
      }
    );
  }

  if (data === 'special_btn_refresh') {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery('🚫 Admin only.');
    await ctx.answerCbQuery();
    return renderSpecialScholarsMessage(ctx, true);
  }

  if (data === 'special_btn_rm_menu') {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery('🚫 Admin only.');
    const list = await getSpecialScholars();
    await ctx.answerCbQuery();
    if (list.length === 0) {
      return ctx.editMessageText('📭 No special scholars to untrack.', {
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'special_btn_refresh')]])
      });
    }
    const buttons = list.map(item => [
      Markup.button.callback(`❌ Untrack ${item.scholar_no}`, `special_rm:${item.scholar_no}`)
    ]);
    buttons.push([Markup.button.callback('🔙 Back', 'special_btn_refresh')]);
    return ctx.editMessageText('⭐ <b>Select a scholar to untrack:</b>', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }

  if (data.startsWith('special_add:')) {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery('🚫 Admin only.');
    const scholarNo = data.replace('special_add:', '').toUpperCase();
    await addSpecialScholar(scholarNo);
    await ctx.answerCbQuery(`Scholar ${scholarNo} is now tracked!`);
    const keyboard = await getStudentAdminKeyboard(scholarNo);
    return ctx.editMessageReplyMarkup(keyboard.reply_markup).catch(() => { });
  }

  if (data.startsWith('special_rm:')) {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery('🚫 Admin only.');
    const scholarNo = data.replace('special_rm:', '').toUpperCase();
    await removeSpecialScholar(scholarNo);
    await ctx.answerCbQuery(`Scholar ${scholarNo} untracked.`);
    const keyboard = await getStudentAdminKeyboard(scholarNo);
    return ctx.editMessageReplyMarkup(keyboard.reply_markup).catch(() => { });
  }

  // ── Whitelist Callbacks ──
  if (data === 'whitelist_btn_add') {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery('🚫 Admin only.');
    adminStates.set(ctx.from.id, { state: 'AWAITING_ADD_USER' });
    await ctx.answerCbQuery();
    return ctx.reply(
      '👥 <b>Add User to Whitelist</b>\n\n' +
      'Send the numeric <b>Telegram User ID</b> to approve (e.g. <code>123456789</code>),\n' +
      'or use the <b>👤 Share / Add User</b> keyboard button below to pick a contact directly!\n\n' +
      '<i>Tap Cancel below to abort.</i>',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'action_cancel')]])
      }
    );
  }

  if (data === 'whitelist_btn_refresh') {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery('🚫 Admin only.');
    await ctx.answerCbQuery();
    return renderWhitelistedUsersMessage(ctx, true);
  }

  if (data === 'whitelist_btn_rm_menu') {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery('🚫 Admin only.');
    const list = await getWhitelist();
    await ctx.answerCbQuery();
    if (list.length === 0) {
      return ctx.editMessageText('📭 Whitelist is empty.', {
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Back', 'whitelist_btn_refresh')]])
      });
    }
    const buttons = list.slice(0, 15).map(id => [
      Markup.button.callback(`❌ Remove ID ${id}`, `whitelist_rm:${id}`)
    ]);
    buttons.push([Markup.button.callback('🔙 Back', 'whitelist_btn_refresh')]);
    return ctx.editMessageText('👥 <b>Select a user to remove from whitelist:</b>', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  }

  if (data.startsWith('whitelist_add:')) {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery('🚫 Admin only.');
    const targetId = parseInt(data.replace('whitelist_add:', ''), 10);
    const added = await addToWhitelist(targetId);
    await ctx.answerCbQuery(added ? 'Added to whitelist!' : 'Already whitelisted.');
    try {
      await ctx.telegram.sendMessage(
        targetId,
        '🎉 *Access Granted!*\n\nYou have been granted access to Resbot. You can now use the bot to search for student results.',
        { parse_mode: 'Markdown' }
      );
    } catch (e) { }
    return ctx.editMessageText(
      `✅ User <code>${targetId}</code> has been approved and added to the whitelist.`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('➖ Remove from Whitelist', `whitelist_rm:${targetId}`)],
          [Markup.button.callback('📜 View Search History', `his_usr:${targetId}:1`)]
        ])
      }
    );
  }

  if (data.startsWith('whitelist_rm:')) {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery('🚫 Admin only.');
    const targetId = parseInt(data.replace('whitelist_rm:', ''), 10);
    const removed = await removeFromWhitelist(targetId);
    await ctx.answerCbQuery(removed ? 'Removed from whitelist.' : 'Not in whitelist.');
    return ctx.editMessageText(
      `❌ User <code>${targetId}</code> has been removed from the whitelist.`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('👥 Re-add to Whitelist', `whitelist_add:${targetId}`)]
        ])
      }
    );
  }

  // ── Handle pagination ──
  if (data.startsWith('page:')) {
    const parts = data.split(':'); // ['page', pageNum, queryId]
    if (parts.length !== 3) return;

    const page = parseInt(parts[1], 10);
    const queryId = parts[2];
    const query = queryCache.get(queryId);

    if (!query) {
      return ctx.answerCbQuery('⚠️ Search session expired. Please search again.');
    }

    try {
      const isUserAdmin = isAdmin(ctx.from?.id);
      const { results, total } = await searchUnifiedStudents(query, page, 10, isUserAdmin);

      if (results.length === 0) {
        return ctx.answerCbQuery('No results found on this page.');
      }

      // Build inline buttons for matches
      const buttons = results.map((s) =>
        [Markup.button.callback(
          `${s.name} (${s.scholar_no})`,
          `select:${s.scholar_no}`
        )]
      );

      // Add navigation row
      const totalPages = Math.ceil(total / 10);
      const navRow = [];

      if (page > 1) {
        navRow.push(Markup.button.callback('⬅️ Prev', `page:${page - 1}:${queryId}`));
      }

      navRow.push(Markup.button.callback(`${page}/${totalPages}`, 'noop'));

      if (page < totalPages) {
        navRow.push(Markup.button.callback('Next ➡️', `page:${page + 1}:${queryId}`));
      }

      buttons.push(navRow);

      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `🔍 Found *${total}* students matching "*${escape(query)}*"\\. Select one:`,
        {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard(buttons),
        }
      );

    } catch (err) {
      console.error('[Bot] Error handling pagination callback:', err);
      await ctx.answerCbQuery('Error loading page.');
    }
    return;
  }

  // ── Handle history menu ──
  if (data === 'his_menu') {
    if (ctx.from?.id !== ADMIN_ID) {
      return ctx.answerCbQuery('🚫 Admin only.');
    }
    await ctx.answerCbQuery();
    return ctx.editMessageText(
      '📜 *Search History*\n\nSelect a timeframe to view search logs:',
      {
        parse_mode: 'Markdown',
        ...getHistoryFilterKeyboard(),
      }
    );
  }

  // ── Handle history timeframe selection ──
  if (data.startsWith('his_tf:')) {
    if (ctx.from?.id !== ADMIN_ID) {
      return ctx.answerCbQuery('🚫 Admin only.');
    }
    const timeframe = data.replace('his_tf:', '');
    await ctx.answerCbQuery();
    try {
      await renderHistoryPage(ctx, timeframe, 1, true);
    } catch (err) {
      console.error('[Bot] Error rendering history page:', err);
      await ctx.answerCbQuery('Error loading history.');
    }
    return;
  }

  // ── Handle history pagination ──
  if (data.startsWith('his_pg:')) {
    if (ctx.from?.id !== ADMIN_ID) {
      return ctx.answerCbQuery('🚫 Admin only.');
    }
    const parts = data.split(':'); // ['his_pg', timeframe, page]
    if (parts.length === 3) {
      const timeframe = parts[1];
      const page = parseInt(parts[2], 10) || 1;
      await ctx.answerCbQuery();
      try {
        await renderHistoryPage(ctx, timeframe, page, true);
      } catch (err) {
        console.error('[Bot] Error navigating history:', err);
        await ctx.answerCbQuery('Error loading page.');
      }
    }
    return;
  }

  // ── Handle user history pagination ──
  if (data.startsWith('his_usr:')) {
    if (ctx.from?.id !== ADMIN_ID) {
      return ctx.answerCbQuery('🚫 Admin only.');
    }
    const parts = data.split(':'); // ['his_usr', targetUserId, page]
    if (parts.length === 3) {
      const targetUserId = parseInt(parts[1], 10);
      const page = parseInt(parts[2], 10) || 1;
      await ctx.answerCbQuery();
      try {
        await renderUserHistoryPage(ctx, targetUserId, page, true);
      } catch (err) {
        console.error('[Bot] Error navigating user history:', err);
        await ctx.answerCbQuery('Error loading page.');
      }
    }
    return;
  }

  // ── Handle AI history menu ──
  if (data === 'his_ai_menu') {
    if (ctx.from?.id !== ADMIN_ID) {
      return ctx.answerCbQuery('🚫 Admin only.');
    }
    await ctx.answerCbQuery();
    return ctx.editMessageText(
      '🤖 *AI Question History*\n\nSelect a timeframe to view questions asked to the AI:',
      {
        parse_mode: 'Markdown',
        ...getAiHistoryFilterKeyboard(),
      }
    );
  }

  // ── Handle AI history timeframe selection ──
  if (data.startsWith('his_aitf:')) {
    if (ctx.from?.id !== ADMIN_ID) {
      return ctx.answerCbQuery('🚫 Admin only.');
    }
    const timeframe = data.replace('his_aitf:', '');
    await ctx.answerCbQuery();
    try {
      await renderAiHistoryPage(ctx, timeframe, 1, true);
    } catch (err) {
      console.error('[Bot] Error rendering AI history page:', err);
      await ctx.answerCbQuery('Error loading AI history.');
    }
    return;
  }

  // ── Handle AI history pagination ──
  if (data.startsWith('his_aipg:')) {
    if (ctx.from?.id !== ADMIN_ID) {
      return ctx.answerCbQuery('🚫 Admin only.');
    }
    const parts = data.split(':'); // ['his_aipg', timeframe, page]
    if (parts.length === 3) {
      const timeframe = parts[1];
      const page = parseInt(parts[2], 10) || 1;
      await ctx.answerCbQuery();
      try {
        await renderAiHistoryPage(ctx, timeframe, page, true);
      } catch (err) {
        console.error('[Bot] Error navigating AI history:', err);
        await ctx.answerCbQuery('Error loading page.');
      }
    }
    return;
  }

  // ── Handle User AI history pagination ──
  if (data.startsWith('his_aiusr:')) {
    if (ctx.from?.id !== ADMIN_ID) {
      return ctx.answerCbQuery('🚫 Admin only.');
    }
    const parts = data.split(':'); // ['his_aiusr', targetUserId, page]
    if (parts.length === 3) {
      const targetUserId = parseInt(parts[1], 10);
      const page = parseInt(parts[2], 10) || 1;
      await ctx.answerCbQuery();
      try {
        await renderUserAiHistoryPage(ctx, targetUserId, page, true);
      } catch (err) {
        console.error('[Bot] Error navigating user AI history:', err);
        await ctx.answerCbQuery('Error loading page.');
      }
    }
    return;
  }

  // ── Handle NLQ Anomaly Warn User ──
  if (data.startsWith('nlq_warn:')) {
    if (!isAdmin(ctx.from?.id)) {
      return ctx.answerCbQuery('🚫 Admin only.');
    }
    const targetUserId = parseInt(data.replace('nlq_warn:', ''), 10);
    try {
      await ctx.telegram.sendMessage(
        targetUserId,
        '⚠️ <b>Warning from Administrator</b>\n\n' +
        'Your recent queries violated bot usage guidelines (e.g. prompt injection, unauthorized requests, or automated scraping).\n\n' +
        'Continued abuse will result in immediate and permanent revocation of your access.',
        { parse_mode: 'HTML' }
      );
      await ctx.answerCbQuery('⚠️ Warning sent to user.');
      try {
        await ctx.editMessageReplyMarkup({
          inline_keyboard: [
            [
              { text: '✅ Warning Sent', callback_data: 'noop' },
              { text: '🚫 Revoke Access', callback_data: `nlq_revoke:${targetUserId}` }
            ]
          ]
        });
      } catch {}
    } catch (err) {
      console.error('[Bot] Failed to send warning to user:', err.message);
      await ctx.answerCbQuery(`Failed to send warning: ${err.message}`);
    }
    return;
  }

  // ── Handle NLQ Anomaly Revoke Access ──
  if (data.startsWith('nlq_revoke:')) {
    if (!isAdmin(ctx.from?.id)) {
      return ctx.answerCbQuery('🚫 Admin only.');
    }
    const targetUserId = parseInt(data.replace('nlq_revoke:', ''), 10);
    try {
      const removed = await removeFromWhitelist(targetUserId);
      await ctx.telegram.sendMessage(
        targetUserId,
        '🚫 <b>Access Revoked</b>\n\nYour access to this bot has been revoked by the administrator due to policy violations.',
        { parse_mode: 'HTML' }
      ).catch(() => {});

      await ctx.answerCbQuery(removed ? '🚫 User access revoked.' : 'User was not on whitelist.');
      try {
        await ctx.editMessageReplyMarkup({
          inline_keyboard: [
            [
              { text: '🚫 Access Revoked', callback_data: 'noop' }
            ]
          ]
        });
      } catch {}
    } catch (err) {
      console.error('[Bot] Failed to revoke access:', err.message);
      await ctx.answerCbQuery(`Failed to revoke access: ${err.message}`);
    }
    return;
  }

  // ── Handle Feedback Navigation ──
  if (data.startsWith('fb_nav:')) {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery('🚫 Admin only.');
    const page = parseInt(data.replace('fb_nav:', ''), 10) || 1;
    await ctx.answerCbQuery();
    return renderFeedbackCard(ctx, page, true);
  }

  // ── Handle Feedback Rating ──
  if (data.startsWith('fb_rate:')) {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery('🚫 Admin only.');
    const parts = data.split(':'); // ['fb_rate', id, rating, page]
    const queryId = parseInt(parts[1], 10);
    const rating = parts[2];
    const page = parseInt(parts[3], 10) || 1;

    const q = await getAiQueryById(queryId);
    if (!q) {
      return ctx.answerCbQuery('Query record not found.');
    }

    if (rating === 'good') {
      await rateAiQuery(queryId, 'good');
      await ctx.answerCbQuery('👍 Marked as Good.');
      return renderFeedbackCard(ctx, page, true);
    }

    if (rating === 'bad') {
      await rateAiQuery(queryId, 'bad');
      adminStates.set(ctx.from.id, {
        state: 'AWAITING_CORRECT_INTENT',
        queryId,
        queryText: q.query_text,
        wrongOutput: q.intent || q.rejection_reason || 'Rejected',
        page
      });
      await ctx.answerCbQuery('👎 Marked as Bad.');
      return ctx.reply(
        `👎 <b>Marked Query #${queryId} as Bad.</b>\n\n` +
        `❓ <b>Query:</b> "<i>${escapeHTML(q.query_text)}</i>"\n` +
        `❌ <b>Bot Output:</b> <code>${escapeHTML(q.intent || q.rejection_reason || 'Rejected')}</code>\n\n` +
        `🎯 <b>How should the model handle this?</b>\n` +
        `• <i>Tap <b>🚫 Out of Scope</b> below for 1-click correction</i>\n` +
        `• <i>Or reply with shorthand or plain English:</i>\n` +
        `  ↳ <code>topper it-26 sem 3 spi</code>\n` +
        `  ↳ <code>avg cpi cse-24</code>\n` +
        `  ↳ <code>lookup 25U020130</code>\n` +
        `  ↳ <code>unsupported</code>\n\n` +
        `<i>Send /cancel to skip.</i>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🚫 Mark as UNSUPPORTED (1-Click)', `fb_correct:${queryId}:unsupported:${page}`)],
            [Markup.button.callback('⏭️ Skip Correction', `fb_nav:${page}`)]
          ])
        }
      );
    }
    return;
  }

  // ── Handle 1-Click Feedback Correction ──
  if (data.startsWith('fb_correct:')) {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery('🚫 Admin only.');
    const parts = data.split(':'); // ['fb_correct', id, type, page]
    const queryId = parseInt(parts[1], 10);
    const type = parts[2];
    const page = parseInt(parts[3], 10) || 1;

    const q = await getAiQueryById(queryId);
    if (!q) return ctx.answerCbQuery('Query record not found.');

    if (type === 'unsupported') {
      adminStates.delete(ctx.from.id);
      const correctOutput = JSON.stringify({ intent: 'UNSUPPORTED', params: {}, confidence: 'high' }, null, 2);
      await addFeedbackCorrection(q.query_text, q.intent || q.rejection_reason || 'Rejected', correctOutput);
      await ctx.answerCbQuery('✅ Saved as UNSUPPORTED');
      await ctx.reply(
        `✅ <b>Correction Saved to Knowledge Base!</b>\n\n` +
        `❓ <b>Query:</b> "<i>${escapeHTML(q.query_text)}</i>"\n` +
        `🎯 <b>Correct Intent:</b> <code>UNSUPPORTED</code>\n\n` +
        `<i>Dynamic few-shot embedding generated. Loading next unrated query...</i>`,
        { parse_mode: 'HTML' }
      );
      return renderFeedbackCard(ctx, page, false);
    }
  }

  // ── Handle Feedback Close ──
  if (data === 'fb_close') {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery('🚫 Admin only.');
    await ctx.answerCbQuery();
    try {
      await ctx.editMessageText('👋 Feedback review closed.', { parse_mode: 'HTML' });
    } catch {}
    return;
  }
});

// ─────────────────────────────────────────────
// LAUNCH & KEEP-ALIVE SERVER
// ─────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/', (req, res) => {
  res.send('Bot is active.');
});

// Pre-load registration data into memory cache
loadRegistrationData();

// Initialize database schema, then launch bot & server
initSchema()
  .then(() => {
    console.log('[Database] PostgreSQL schema initialized successfully.');

    setupBotCommands();

    const launchBot = () => {
      if (process.env.WEBHOOK_URL) {
        app.use(bot.webhookCallback('/'));
        bot.telegram.setWebhook(process.env.WEBHOOK_URL)
          .then(() => console.log(`[Bot] Webhook set to ${process.env.WEBHOOK_URL}`))
          .catch((err) => console.error('[Bot] Webhook setup failed:', err));
      } else {
        bot.launch()
          .then(() => console.log('[Bot] Bot launched successfully in polling mode.'))
          .catch((err) => {
            console.error('[Bot] Failed to launch polling:', err);
            console.log('[Bot] Retrying polling launch in 5 seconds...');
            setTimeout(launchBot, 5000);
          });
      }
    };
    launchBot();

    app.listen(PORT, () => {
      console.log(`[Server] Web service listening on port ${PORT}`);

      // Spawn Excel import in the background on startup
      try {
        const { fork } = require('child_process');
        const path = require('path');
        const importProcess = fork(path.join(__dirname, '../scripts/import_excel.js'));

        importProcess.on('exit', (code) => {
          console.log(`[Server] Background Excel import finished with exit code ${code}`);
        });
      } catch (err) {
        console.error('[Server] Failed to spawn background Excel import:', err);
      }
    });
  })
  .catch((err) => {
    console.error('[Database] Critical: Database schema initialization failed:', err);
    process.exit(1);
  });

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception:', err);
});
