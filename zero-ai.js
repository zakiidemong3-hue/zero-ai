#!/usr/bin/env node
/* ============================================================
   ZERO AI CLI — Terminal AI Chat with Google Gemini
   Run: node zero-ai.js
   ============================================================ */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

// ========== CONFIG ==========
const CONFIG = {
  GEMINI_API_KEY: 'AIzaSyDyxCOC3xmMtnVLskIEq_uWJsDyMt6gwKc',
  GEMINI_MODEL: 'gemini-2.0-flash',
  GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models',
  DATA_DIR: path.join(process.env.HOME || process.env.USERPROFILE || '.', '.zero-ai'),
  DATA_FILE: 'data.json',
  MAX_HISTORY: 50,
  MAX_NAME: 30,
  MAX_DESC: 150,
};

// ========== STORAGE ==========
class Storage {
  constructor() {
    this.dataPath = path.join(CONFIG.DATA_DIR, CONFIG.DATA_FILE);
    this.data = { users: {}, sessions: {} };
    this._init();
  }

  _init() {
    if (!fs.existsSync(CONFIG.DATA_DIR)) {
      fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(this.dataPath)) {
      try {
        this.data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
      } catch {
        this.data = { users: {}, sessions: {} };
      }
    }
  }

  save() {
    fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
  }

  getUser(id) { return this.data.users[id] || null; }
  createUser(user) {
    this.data.users[user.id] = user;
    this.save();
  }
  updateUser(id, updates) {
    if (this.data.users[id]) {
      Object.assign(this.data.users[id], updates);
      this.save();
    }
  }
  userExists(id) { return !!this.data.users[id]; }

  getSession(userId) {
    if (!this.data.sessions[userId]) {
      this.data.sessions[userId] = [];
    }
    return this.data.sessions[userId];
  }
  addMessage(userId, role, text) {
    if (!this.data.sessions[userId]) this.data.sessions[userId] = [];
    this.data.sessions[userId].push({ role, text, time: Date.now() });
    if (this.data.sessions[userId].length > CONFIG.MAX_HISTORY * 2) {
      this.data.sessions[userId] = this.data.sessions[userId].slice(-CONFIG.MAX_HISTORY * 2);
    }
    this.save();
  }
  clearSession(userId) {
    this.data.sessions[userId] = [];
    this.save();
  }
}

const storage = new Storage();

// ========== ID GENERATOR ==========
function genUserId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'ZA-';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return storage.userExists(id) ? genUserId() : id;
}

// ========== COLORS (manual, no chalk dependency) ==========
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgBlack: '\x1b[40m',
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
};

function color(c, text) { return `${c}${text}${C.reset}`; }
function bold(text) { return color(C.bold, text); }
function dim(text) { return color(C.dim, text); }
function cyan(text) { return color(C.cyan, text); }
function blue(text) { return color(C.blue, text); }
function green(text) { return color(C.green, text); }
function yellow(text) { return color(C.yellow, text); }
function red(text) { return color(C.red, text); }
function magenta(text) { return color(C.magenta, text); }
function gray(text) { return color(C.gray, text); }

// ========== BOX DRAWING (manual) ==========
function boxTop(title, width = 50) {
  const pad = Math.max(0, width - title.length - 4);
  return cyan('╭' + '─'.repeat(2) + ' ' + bold(title) + ' ' + '─'.repeat(pad) + '╮');
}
function boxBottom(width = 50) {
  return cyan('╰' + '─'.repeat(width - 2) + '╯');
}
function boxLine(text, width = 50) {
  return cyan('│') + ' ' + text + ' '.repeat(Math.max(0, width - text.length - 3)) + cyan('│');
}
function hr(width = 50) {
  return gray('├' + '─'.repeat(width - 2) + '┤');
}

// ========== LOADING SPINNER ==========
class Spinner {
  constructor(text) {
    this.text = text;
    this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.idx = 0;
    this.interval = null;
  }
  start() {
    process.stdout.write('\x1b[?25l'); // hide cursor
    this.interval = setInterval(() => {
      process.stdout.write('\r' + cyan(this.frames[this.idx]) + ' ' + this.text + '   ');
      this.idx = (this.idx + 1) % this.frames.length;
    }, 80);
  }
  stop(text) {
    clearInterval(this.interval);
    process.stdout.write('\r' + ' '.repeat(this.text.length + 10) + '\r');
    process.stdout.write('\x1b[?25h'); // show cursor
    if (text) console.log(green('✓') + ' ' + text);
  }
}

// ========== READLINE ==========
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
function ask(q) { return new Promise(resolve => rl.question(q, resolve)); }
function closeRL() { rl.close(); process.exit(0); }

// ========== DISPLAY ==========
function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[H');
}

function printHeader() {
  clearScreen();
  const width = 50;
  console.log(boxTop('ZERO AI', width));
  console.log(boxLine(cyan('⚡') + '  ' + bold('Google Gemini AI Chat'), width));
  console.log(boxLine(dim('by rhmt dev · interface by brayn'), width));
  console.log(boxBottom(width));
  console.log('');
}

function printDivider(text) {
  const w = 50;
  const side = Math.floor((w - text.length - 2) / 2);
  console.log(gray('─'.repeat(side) + ' ' + text + ' ' + '─'.repeat(w - side - text.length - 2)));
}

// ========== AUTH ==========
async function showAuthMenu() {
  printHeader();
  console.log(bold('Welcome to Zero AI CLI'));
  console.log(dim('Chat with Google Gemini — powered by Zero ecosystem'));
  console.log('');
  console.log(`  ${cyan('[1]')}  Login with ID`);
  console.log(`  ${cyan('[2]')}  Register New Account`);
  console.log(`  ${cyan('[0]')}  Exit`);
  console.log('');

  const choice = await ask(gray('› ') + 'Choose option: ');

  switch (choice.trim()) {
    case '1': return await login();
    case '2': return await register();
    case '0': closeRL(); break;
    default:
      console.log(red('Invalid option. Try again.'));
      await ask(gray('Press Enter to continue...'));
      return await showAuthMenu();
  }
}

async function register() {
  printHeader();
  console.log(bold('Create New Account'));
  printDivider('register');
  console.log('');

  const name = await ask(cyan('?') + ' Name: ');
  if (!name.trim()) {
    console.log(red('✗ Name is required.'));
    await ask(gray('Press Enter to continue...'));
    return await showAuthMenu();
  }
  if (name.length > CONFIG.MAX_NAME) {
    console.log(red(`✗ Name max ${CONFIG.MAX_NAME} characters.`));
    await ask(gray('Press Enter to continue...'));
    return await showAuthMenu();
  }

  const desc = await ask(cyan('?') + ' Description (optional): ');
  const id = genUserId();

  storage.createUser({
    id,
    name: name.trim(),
    desc: desc.trim().slice(0, CONFIG.MAX_DESC),
    avatar: '',
    createdAt: Date.now(),
  });

  console.log('');
  console.log(green('✓ Account created successfully!'));
  console.log('');
  console.log(bold('Your ID: ') + yellow(id));
  console.log(dim('Save this ID — you need it to login.'));
  console.log('');
  await ask(gray('Press Enter to go to login...'));

  return await login(true);
}

async function login(prefillId = false) {
  printHeader();
  console.log(bold('Login'));
  printDivider('login');
  console.log('');

  let id;
  if (prefillId) {
    // Find the last created user
    const users = Object.values(storage.data.users);
    const lastUser = users.sort((a, b) => b.createdAt - a.createdAt)[0];
    id = lastUser ? lastUser.id : '';
    console.log(dim('Your ID: ') + (id ? yellow(id) : red('Not found')));
  }

  id = await ask(cyan('?') + ' Enter your ID (ZA-XXXXXX): ');
  id = id.trim().toUpperCase();

  if (!storage.userExists(id)) {
    console.log(red('✗ ID not found. Please register first.'));
    await ask(gray('Press Enter to continue...'));
    return await showAuthMenu();
  }

  const user = storage.getUser(id);
  console.log('');
  console.log(green('✓ Welcome back, ') + bold(user.name) + green('!'));
  await ask(gray('Press Enter to start chatting...'));

  return await mainChat(id);
}

// ========== CHAT WITH GEMINI ==========
async function callGemini(messages) {
  // Build conversation history for Gemini
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }));

  const url = `${CONFIG.GEMINI_API_URL}/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API Error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '(no response)';
}

async function mainChat(userId) {
  const user = storage.getUser(userId);
  let chatActive = true;

  printHeader();
  console.log(bold('Chat with Gemini AI'));
  console.log(dim(`Logged in as: ${user.name} (${userId})`));
  console.log(dim('Type /help for commands, /exit to logout'));
  console.log('');
  printDivider('chat');
  console.log('');

  while (chatActive) {
    const input = await ask(cyan('You') + gray(' › '));

    // Commands
    if (input.startsWith('/')) {
      const cmd = input.trim().toLowerCase();
      switch (cmd) {
        case '/exit':
        case '/quit':
          chatActive = false;
          console.log(green('✓ Logged out. See you later!'));
          break;
        case '/help':
          console.log('');
          console.log(bold('Commands:'));
          console.log(`  ${cyan('/help')}    - Show this help`);
          console.log(`  ${cyan('/clear')}   - Clear chat history`);
          console.log(`  ${cyan('/history')} - Show last 10 messages`);
          console.log(`  ${cyan('/profile')} - Show your profile`);
          console.log(`  ${cyan('/exit')}    - Logout`);
          console.log('');
          break;
        case '/clear':
          storage.clearSession(userId);
          console.log(green('✓ Chat history cleared.'));
          break;
        case '/history':
          const history = storage.getSession(userId);
          if (history.length === 0) {
            console.log(dim('No chat history.'));
          } else {
            console.log('');
            history.slice(-10).forEach(m => {
              const role = m.role === 'user' ? cyan('You') : magenta('AI');
              const time = new Date(m.time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
              console.log(`${gray(time)} ${role}: ${m.text.slice(0, 80)}${m.text.length > 80 ? '...' : ''}`);
            });
            console.log('');
          }
          break;
        case '/profile':
          console.log('');
          console.log(bold('Profile:'));
          console.log(`  ID    : ${yellow(user.id)}`);
          console.log(`  Name  : ${bold(user.name)}`);
          console.log(`  Desc  : ${user.desc || dim('(no description)')}`);
          console.log(`  Joined: ${new Date(user.createdAt).toLocaleDateString('id-ID')}`);
          console.log('');
          break;
        default:
          console.log(red(`Unknown command: ${cmd}. Type /help for commands.`));
      }
      continue;
    }

    if (!input.trim()) continue;

    // Save user message
    storage.addMessage(userId, 'user', input.trim());

    // Get conversation history
    const messages = storage.getSession(userId);

    // Call Gemini
    const spinner = new Spinner('Thinking...');
    spinner.start();

    try {
      const reply = await callGemini(messages);
      spinner.stop('Done');
      storage.addMessage(userId, 'assistant', reply);
      console.log('');
      console.log(magenta('AI') + gray(' › ') + reply);
      console.log('');
    } catch (err) {
      spinner.stop(null);
      console.log(red('✗ Error: ') + err.message);
      // Remove the failed message from history
      const session = storage.data.sessions[userId] || [];
      session.pop();
      storage.save();
    }
  }

  // Return to auth menu
  await showAuthMenu();
}

// ========== MAIN ==========
async function main() {
  console.clear();
  printHeader();
  console.log(bold('Zero AI CLI v1.0'));
  console.log(dim('Google Gemini Flash 2.0'));
  console.log('');
  console.log(green('✓') + ' API Key configured');
  console.log(green('✓') + ` Data stored in: ${CONFIG.DATA_DIR}`);
  console.log('');

  await showAuthMenu();
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('');
  console.log(gray('\nGoodbye! 👋'));
  closeRL();
});

// Start
main().catch(err => {
  console.error(red('Fatal error:'), err);
  closeRL();
});
