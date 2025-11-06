/* Configuration */
const CONFIG = {
  defaultAccent: 'purple',
  bannerContent: null,
  bannerText: null,
  bannerAsciiFont: 'ANSI Shadow',
  bannerSize: { min: '12px', vw: '2.4vw', max: '20px' },
  showBannerOnLoad: true,
  themeMap: { purple: '#9b87f5', cyan: '#7cd4ff', green: '#7bd88f', orange: '#f97316' }
};

async function loadExternalConfig() {
  try {
    // Add timestamp to bypass cache more aggressively
    const timestamp = new Date().getTime();
    const res = await fetch(`config.json?t=${timestamp}`, { 
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    if (!res.ok) {
      console.warn('Config.json not found, using defaults');
      return;
    }
    const incoming = await res.json();
    if (incoming && typeof incoming === 'object') {
      const { themeMap, bannerSize, ...rest } = incoming;

      if (themeMap && typeof themeMap === 'object') {
        CONFIG.themeMap = { ...CONFIG.themeMap, ...themeMap };
      }

      if (bannerSize && typeof bannerSize === 'object') {
        CONFIG.bannerSize = { ...CONFIG.bannerSize, ...bannerSize };
      }

      Object.assign(CONFIG, rest);
      console.log('Config loaded:', CONFIG);
      // Register commands from config
      registerCommandsFromConfig();
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

function applyBannerSize() {
  const { min, vw, max } = CONFIG.bannerSize || {};
  const root = document.documentElement;
  
  // Always set the variables, even if empty (will use CSS fallbacks)
  const minVal = min || '12px';
  const vwVal = vw || '2.4vw';
  const maxVal = max || '20px';
  
  root.style.setProperty('--banner-size-min', minVal);
  root.style.setProperty('--banner-size-vw', vwVal);
  root.style.setProperty('--banner-size-max', maxVal);
  
  console.log('Banner size applied:', { min: minVal, vw: vwVal, max: maxVal });
}

/* State and elements */
const appState = {
  history: [],
  historyIndex: 0,
  accent: 'purple',
  cwd: '~',
  typingInProgress: false,
  typingQueue: [],
  recentCommands: [],
  paletteCategories: {},
};

const outputEl = document.getElementById('output');
const inputEl = document.getElementById('input');
const paletteEl = document.getElementById('palette');
const paletteInputEl = document.getElementById('palette-input');
const paletteListEl = document.getElementById('palette-list');
const statusThemeEl = document.getElementById('status-theme');
const statusModeEl = document.getElementById('status-mode');

const BANNER = String.raw` ██████╗ █████╗ ██╗     ███╗   ███╗██╗    ██╗ █████╗ ██████╗ ███████╗   
██╔════╝██╔══██╗██║     ████╗ ████║██║    ██║██╔══██╗██╔══██╗██╔════╝   
██║     ███████║██║     ██╔████╔██║██║ █╗ ██║███████║██████╔╝█████╗     
██║     ██╔══██║██║     ██║╚██╔╝██║██║███╗██║██╔══██║██╔══██╗██╔══╝     
╚██████╗██║  ██║███████╗██║ ╚═╝ ██║╚███╔███╔╝██║  ██║██║  ██║███████╗██╗
 ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝
                                                                        
██████╗ ███████╗██╗   ██╗
██╔══██╗██╔════╝██║   ██║
██║  ██║█████╗  ██║   ██║
██║  ██║██╔══╝  ╚██╗ ██╔╝
██████╔╝███████╗ ╚████╔╝ 
╚═════╝ ╚══════╝  ╚═══╝  `;

/* Utils */
function escapeHTML(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function echo(html) {
  const line = document.createElement('div');
  line.className = 'line';
  line.innerHTML = html;
  outputEl.appendChild(line);
  outputEl.scrollTop = outputEl.scrollHeight;
}

function echoText(text) {
  echo(`<span>${escapeHTML(text)}</span>`);
}

function echoBanner() {
  const content = CONFIG.bannerContent ?? BANNER;
  echo(`<pre class="banner" aria-hidden="true">${escapeHTML(content)}</pre>`);
}

/* ASCII Banner Generation */
const bannerFontState = { loaded: false, name: null };

function loadFigletFont(fontName) {
  return new Promise((resolve, reject) => {
    if (!window.figlet) {
      reject(new Error('figlet library not loaded'));
      return;
    }
    
    if (bannerFontState.loaded && bannerFontState.name === fontName) {
      resolve();
      return;
    }
    
    // Configure figlet to load fonts from CDN
    if (window.figlet.defaults) {
      window.figlet.defaults({
        fontPath: 'https://cdn.jsdelivr.net/npm/figlet@1.7.0/fonts'
      });
    }
    
    // Try to load the font
    window.figlet.loadFont(fontName, (err, fontData) => {
      if (err) {
        // Try with "Standard" font as fallback
        if (fontName !== 'Standard') {
          window.figlet.loadFont('Standard', (err2, fontData2) => {
            if (err2) {
              reject(err2);
            } else {
              bannerFontState.loaded = true;
              bannerFontState.name = 'Standard';
              resolve();
            }
          });
        } else {
          reject(err);
        }
      } else {
        bannerFontState.loaded = true;
        bannerFontState.name = fontName;
        resolve();
      }
    });
  });
}

function echoAsciiBannerFromText(text, fontName) {
  return new Promise((resolve) => {
    if (!window.figlet) {
      // Fallback to plain text if figlet not available
      echo(`<pre class="banner" aria-hidden="true">${escapeHTML(text)}</pre>`);
      resolve();
      return;
    }
    
    // Use the loaded font name, or fallback to Standard
    const fontToUse = bannerFontState.name || fontName || 'Standard';
    
    window.figlet.text(text, { font: fontToUse }, (err, data) => {
      if (err) {
        // Fallback to plain text
        echo(`<pre class="banner" aria-hidden="true">${escapeHTML(text)}</pre>`);
      } else {
        echo(`<pre class="banner" aria-hidden="true">${escapeHTML(data)}</pre>`);
      }
      resolve();
    });
  });
}

async function renderConfiguredBanner() {
  // Priority: bannerText (ASCII) > bannerContent (raw ASCII) > built-in BANNER
  if (CONFIG.bannerText && window.figlet && CONFIG.bannerAsciiFont) {
    try {
      await loadFigletFont(CONFIG.bannerAsciiFont);
      await echoAsciiBannerFromText(CONFIG.bannerText, CONFIG.bannerAsciiFont);
      return;
    } catch (err) {
      // Fall through to fallback
    }
  }
  
  // Fallback to raw ASCII content or built-in banner
  echoBanner();
}

function getTimestamp() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function echoTyped(text, speed = 15) {
  return new Promise((resolve) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      echoText(text);
      resolve();
      return;
    }

    const line = document.createElement('div');
    line.className = 'line';
    outputEl.appendChild(line);
    
    let index = 0;
    let cancelled = false;
    const span = document.createElement('span');
    line.appendChild(span);
    
    function typeChar() {
      if (cancelled || index >= text.length) {
        if (index < text.length) {
          span.textContent = text;
        }
        resolve();
        return;
      }
      
      const char = text[index];
      if (char === '\n') {
        const br = document.createElement('br');
        span.appendChild(br);
      } else {
        span.textContent += char;
      }
      index++;
      outputEl.scrollTop = outputEl.scrollHeight;
      setTimeout(typeChar, speed);
    }
    
    appState.typingInProgress = true;
    typeChar();
    
    // Store cancel function
    appState.cancelTyping = () => {
      cancelled = true;
      appState.typingInProgress = false;
    };
  });
}

function echoError(text, details = null) {
  const errorHtml = `<div class="feedback-card feedback-error">
    <div class="feedback-header">
      <span class="feedback-icon">✕</span>
      <span class="feedback-title">Error</span>
    </div>
    <div class="feedback-body">${escapeHTML(text)}</div>
    ${details ? `<div class="feedback-details">${escapeHTML(details)}</div>` : ''}
  </div>`;
  echo(errorHtml);
}

function echoSuccess(text, details = null) {
  const successHtml = `<div class="feedback-card feedback-success">
    <div class="feedback-header">
      <span class="feedback-icon">✓</span>
      <span class="feedback-title">Success</span>
    </div>
    <div class="feedback-body">${escapeHTML(text)}</div>
    ${details ? `<div class="feedback-details">${escapeHTML(details)}</div>` : ''}
  </div>`;
  echo(successHtml);
}

function echoWarning(text, details = null) {
  const warningHtml = `<div class="feedback-card feedback-warning">
    <div class="feedback-header">
      <span class="feedback-icon">⚠</span>
      <span class="feedback-title">Warning</span>
    </div>
    <div class="feedback-body">${escapeHTML(text)}</div>
    ${details ? `<div class="feedback-details">${escapeHTML(details)}</div>` : ''}
  </div>`;
  echo(warningHtml);
}

function echoInfo(text, details = null) {
  const infoHtml = `<div class="feedback-card feedback-info">
    <div class="feedback-header">
      <span class="feedback-icon">ℹ</span>
      <span class="feedback-title">Info</span>
    </div>
    <div class="feedback-body">${escapeHTML(text)}</div>
    ${details ? `<div class="feedback-details">${escapeHTML(details)}</div>` : ''}
  </div>`;
  echo(infoHtml);
}

function showProgress(message, progress = 0) {
  const progressHtml = `<div class="feedback-card feedback-progress">
    <div class="feedback-header">
      <span class="feedback-icon">⟳</span>
      <span class="feedback-title">${escapeHTML(message)}</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${Math.min(100, Math.max(0, progress))}%"></div>
    </div>
  </div>`;
  echo(progressHtml);
}

function echoWithTimestamp(html) {
  const timestamp = getTimestamp();
  echo(`<span class="timestamp">[${timestamp}]</span> ${html}`);
}

function echoCommand(command) {
  const timestamp = getTimestamp();
  const commandHtml = `<div class="command-block">
    <span class="timestamp">[${timestamp}]</span>
    <span class="command-prompt">$</span>
    <span class="command-text">${escapeHTML(command)}</span>
  </div>`;
  echo(commandHtml);
}

function echoCommandOutput(content) {
  const outputHtml = `<div class="output-block">${content}</div>`;
  echo(outputHtml);
}

function slugifyCommand(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function resolveContentPath(typedCommand, handlerId, markdownFile = null) {
  const cfg = CONFIG.content || {};
  const dir = cfg.dir || 'content';
  const ext = cfg.ext || '.md';
  const map = cfg.map || {};
  
  // If markdown file is explicitly provided, use it directly
  if (markdownFile) {
    // If markdownFile already has extension, use as-is, otherwise add ext
    if (markdownFile.endsWith('.md') || markdownFile.endsWith('.markdown')) {
      return `${dir}/${markdownFile}`;
    }
    return `${dir}/${markdownFile}${ext}`;
  }
  
  // Otherwise, use the existing resolution logic
  if (map[typedCommand]) return `${dir}/${map[typedCommand]}`;
  const typedSlug = slugifyCommand(typedCommand);
  if (typedSlug) return `${dir}/${typedSlug}${ext}`;
  return `${dir}/${handlerId}${ext}`;
}

async function loadAndRenderMarkdown(typedCommand, handlerId, markdownFile = null) {
  const path = resolveContentPath(typedCommand, handlerId, markdownFile);
  try {
    const res = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    
    // Get marked parser (try multiple possible global names)
    const markedParser = window.marked || (typeof marked !== 'undefined' ? marked : null);
    if (!markedParser || !markedParser.parse) {
      echoError('Markdown parser not available', 'The marked library failed to load. Please refresh the page.');
      return;
    }
    
    // Parse markdown to HTML
    const rawHtml = markedParser.parse(md);
    
    // Sanitize HTML if DOMPurify is available
    const html = (window.DOMPurify && window.DOMPurify.sanitize) 
      ? window.DOMPurify.sanitize(rawHtml) 
      : rawHtml;
    
    echo(html); // will be wrapped as output block by caller
  } catch (e) {
    echoWarning(`Content not found for "${typedCommand}"`, `${path}`);
  }
}

function clearOutput() {
  outputEl.innerHTML = '';
}

function registerCommandsFromConfig() {
  if (!CONFIG.commands || !Array.isArray(CONFIG.commands)) return;
  
  CONFIG.commands.forEach(cmdConfig => {
    const { name, description, emoji, markdown, category } = cmdConfig;
    if (!name || !markdown) return; // Skip invalid entries
    
    const cmdName = name.toLowerCase().trim();
    const parts = cmdName.split(' ');
    
    // Register emoji and description
    if (emoji) commandEmojis[cmdName] = emoji;
    if (description) commandDescriptions[cmdName] = description;
    
    // Register handler
    commandHandlers[cmdName] = async () => {
      // Use the markdown filename directly from config
      await loadAndRenderMarkdown(cmdName, null, markdown);
    };
    
    // Register in commandStructure (handle hierarchical commands)
    if (parts.length === 2) {
      // Hierarchical command like "show about"
      const [verb, noun] = parts;
      if (!commandStructure[verb]) {
        commandStructure[verb] = {};
      }
      commandStructure[verb][noun] = {
        handler: cmdName,
        desc: description || '',
        category: category || 'info'
      };
    } else {
      // Simple command like "about"
      commandStructure[cmdName] = {
        handler: cmdName,
        desc: description || '',
        category: category || 'info'
      };
    }
  });
}

function setAccent(name) {
  const color = (CONFIG.themeMap && CONFIG.themeMap[name]) || CONFIG.themeMap.purple;
  document.documentElement.style.setProperty('--accent', color);
  appState.accent = name;
  if (statusThemeEl) {
    statusThemeEl.textContent = name;
  }
}

/* Command structure - verb-noun hierarchy */
const commandStructure = {
  set: {
    theme: { handler: 'theme', desc: 'Change the accent color theme [purple|cyan|green|orange]', category: 'system', flags: { '--color': '-c', '--theme': '-t' } },
  },
  clear: { handler: 'clear', desc: 'Clear the terminal output', category: 'system' },
  help: { handler: 'help', desc: 'Show available commands and shortcuts', category: 'system' },
  theme: { handler: 'theme', desc: 'Change the accent color theme [purple|cyan|green|orange]', category: 'system' },
  reload: { handler: 'reload', desc: 'Reload configuration from config.json and update banner', category: 'system' },
};

/* Command descriptions for backward compatibility */
const commandDescriptions = {
  clear: 'Clear the terminal output',
  help: 'Show available commands and shortcuts',
  theme: 'Change the accent color theme',
  reload: 'Reload configuration from config.json and update banner',
};

/* Command emojis - populated from config */
const commandEmojis = {
  theme: '🎨',
  clear: '🧹',
  help: '❓',
  reload: '🔄',
  'set theme': '🎨'
};

/* Command handlers */
const commandHandlers = {
  help() {
    const commands = Object.keys(commandHandlers).sort();
    const commandsList = commands.map(cmd => {
      const desc = commandDescriptions[cmd] || 'No description available';
      const emoji = commandEmojis[cmd] || '▪️';
      return `<div style="margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 1.1em;">${emoji}</span>
        <span class="accent">${cmd}</span>
        <span class="dim">${desc}</span>
      </div>`;
    }).join('');
    
    echo(
      `<div>
        <div class="dim" style="margin-bottom: 12px;">Commands:</div>
        ${commandsList}
        <div class="dim" style="margin-top: 16px; margin-bottom: 8px;">Shortcuts:</div>
        <div style="line-height: 1.8;">
          <div><span class="kbd">⌘/Ctrl</span> + <span class="kbd">K</span>  <span class="dim">Open command palette</span></div>
          <div><span class="kbd">Ctrl+C</span>  <span class="dim">Cancel current operation</span></div>
          <div><span class="kbd">Ctrl+L</span>  <span class="dim">Clear terminal</span></div>
          <div><span class="kbd">↑/↓</span>  <span class="dim">Navigate command history</span></div>
          <div><span class="kbd">Tab</span>  <span class="dim">Autocomplete command</span></div>
          <div><span class="kbd">Esc</span>  <span class="dim">Close palette</span></div>
        </div>
      </div>`
    );
  },

  clear() {
    appState.typingInProgress = false;
    clearOutput();
    applyBannerSize(); // Ensure CSS variables are set when banner is re-rendered
    renderConfiguredBanner();
  },

  theme(_, arg) {
    const color = (arg || '').toLowerCase();
    if (!CONFIG.themeMap || !CONFIG.themeMap[color]) {
      const validColors = Object.keys(CONFIG.themeMap || {}).join('|');
      echoError('Invalid theme color', `Usage: theme [${validColors}] or set theme [${validColors}]`);
      return;
    }
    setAccent(color);
    echoSuccess(`Accent theme set to ${color}`, `The terminal accent color has been updated.`);
  },
  
  'set theme'(_, ...args) {
    const color = (args[0] || '').toLowerCase();
    if (!CONFIG.themeMap || !CONFIG.themeMap[color]) {
      const validColors = Object.keys(CONFIG.themeMap || {}).join('|');
      echoError('Invalid theme color', `Usage: set theme [${validColors}]`);
      return;
    }
    setAccent(color);
    echoSuccess(`Accent theme set to ${color}`, `The terminal accent color has been updated.`);
  },
  
  async reload() {
    echoInfo('Reloading configuration...');
    
    // Ensure figlet is loaded
    if (!window.figlet) {
      let figletCheckAttempts = 0;
      while (!window.figlet && figletCheckAttempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        figletCheckAttempts++;
      }
    }
    
    // Configure figlet font path if available
    if (window.figlet && window.figlet.defaults) {
      window.figlet.defaults({
        fontPath: 'https://cdn.jsdelivr.net/npm/figlet@1.7.0/fonts'
      });
    }
    
    await loadExternalConfig();
    applyBannerSize();
    setAccent(CONFIG.defaultAccent);
    
    // Clear and re-render banner with new config
    clearOutput();
    if (CONFIG.showBannerOnLoad) {
      await renderConfiguredBanner();
    }
    echoSuccess('Configuration reloaded', 'Banner and settings have been updated.');
  },
};

/* Command execution */
function parseInput(value) {
  const trimmed = value.trim();
  if (trimmed === '') return { cmd: '', args: [], flags: {} };
  
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = [];
  const flags = {};
  
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('--')) {
      const flagName = part.slice(2);
      flags[flagName] = parts[i + 1] || true;
      if (parts[i + 1]) i++;
    } else if (part.startsWith('-')) {
      const flagName = part.slice(1);
      flags[flagName] = parts[i + 1] || true;
      if (parts[i + 1]) i++;
    } else {
      args.push(part);
    }
  }
  
  // Check for hierarchical commands (verb-noun)
  if (parts.length >= 2) {
    const verbNoun = `${parts[0]} ${parts[1]}`.toLowerCase();
    if (commandStructure[verbNoun] || commandHandlers[verbNoun]) {
      return { cmd: verbNoun, args: args.slice(1), flags };
    }
  }
  
  return { cmd, args, flags };
}

async function runCommand(raw) {
  const { cmd, args, flags } = parseInput(raw);
  if (!cmd) return;

  // Special handling for clear command - it clears output, so don't wrap it
  if (cmd === 'clear') {
    echoCommand(raw);
    // Check command structure first
    let handler = commandHandlers[cmd];
    
    if (handler) {
      try {
        // Track recent commands
        if (appState.recentCommands.length >= 10) {
          appState.recentCommands.shift();
        }
        appState.recentCommands.push(raw);
        
        const result = handler(appState, ...args);
        if (result instanceof Promise) {
          await result;
        }
      } catch (e) {
        echoError(`Command execution failed: ${e.message}`, e.stack || '');
      }
    }
    appState.typingInProgress = false;
    appState.cancelTyping = null;
    return;
  }

  // Display command in styled command block
  echoCommand(raw);
  
  // Create a marker to track where output starts
  const outputMarker = document.createElement('div');
  outputMarker.className = 'output-marker';
  outputMarker.style.display = 'none';
  outputEl.appendChild(outputMarker);
  
  // Check command structure first
  let handler = commandHandlers[cmd];
  let commandInfo = commandStructure[cmd];
  
  // If not found, check hierarchical structure
  if (!handler && !commandInfo) {
    const parts = cmd.split(' ');
    if (parts.length === 2) {
      const [verb, noun] = parts;
      if (commandStructure[verb] && commandStructure[verb][noun]) {
        commandInfo = commandStructure[verb][noun];
        handler = commandHandlers[commandInfo.handler];
      }
    }
  }
  
  // Also check direct handler
  if (!handler) {
    handler = commandHandlers[cmd];
  }
  
  if (handler) {
    try {
      // Track recent commands
      if (appState.recentCommands.length >= 10) {
        appState.recentCommands.shift();
      }
      appState.recentCommands.push(raw);
      
      const result = handler(appState, ...args);
      if (result instanceof Promise) {
        await result;
      }
    } catch (e) {
      echoError(`Command execution failed: ${e.message}`, e.stack || '');
    }
  } else {
    const suggestion = suggestCommand(cmd);
    echoError(`Command not found: ${cmd}`, suggestion ? `Did you mean "${suggestion}"?` : 'Type "help" to see available commands.');
  }
  
  // Wrap output in output block
  const outputElements = [];
  let currentNode = outputMarker.nextSibling;
  while (currentNode) {
    outputElements.push(currentNode);
    currentNode = currentNode.nextSibling;
  }
  
  if (outputElements.length > 0) {
    // Collect HTML content
    const outputContent = outputElements.map(el => el.outerHTML).join('');
    
    // Remove original elements
    outputElements.forEach(el => el.remove());
    
    // Remove marker
    outputMarker.remove();
    
    // Display wrapped output
    echoCommandOutput(outputContent);
  } else {
    // Remove marker if no output
    outputMarker.remove();
  }
  
  appState.typingInProgress = false;
  appState.cancelTyping = null;
}

/* Fuzzy matching */
function isSubsequence(needle, haystack) {
  let i = 0, j = 0;
  while (i < needle.length && j < haystack.length) {
    if (needle[i] === haystack[j]) i++;
    j++;
  }
  return i === needle.length;
}

function suggestCommand(input) {
  const keys = Object.keys(commandHandlers);
  let best = '';
  let bestScore = -1;
  for (const k of keys) {
    if (k.startsWith(input)) return k;
    if (isSubsequence(input, k)) {
      const score = input.length / k.length;
      if (score > bestScore) { bestScore = score; best = k; }
    }
  }
  return best || '';
}

/* History & completion */
function onKeyDown(e) {
  if (e.key === 'Enter') {
    if (appState.cancelTyping) {
      appState.cancelTyping();
    }
    appState.typingInProgress = false;
    const value = inputEl.value;
    if (value.trim()) {
      appState.history.push(value);
      appState.historyIndex = appState.history.length;
    }
    runCommand(value);
    inputEl.value = '';
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    if (appState.cancelTyping) {
      appState.cancelTyping();
    }
    appState.typingInProgress = false;
    echoText('^C');
    inputEl.value = '';
    e.preventDefault();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
    applyBannerSize(); // Ensure CSS variables are set
    clearOutput();
    renderConfiguredBanner();
    e.preventDefault();
    return;
  }

  if (e.key === 'ArrowUp') {
    if (appState.historyIndex > 0) {
      appState.historyIndex--;
      inputEl.value = appState.history[appState.historyIndex] || '';
      queueMicrotask(() => inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length));
    }
    e.preventDefault();
    return;
  }

  if (e.key === 'ArrowDown') {
    if (appState.historyIndex < appState.history.length) {
      appState.historyIndex++;
      inputEl.value = appState.history[appState.historyIndex] || '';
      queueMicrotask(() => inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length));
    }
    e.preventDefault();
    return;
  }

  if (e.key === 'Tab') {
    const current = inputEl.value.trim();
    if (current) {
      const keys = Object.keys(commandHandlers);
      const matches = keys.filter(k => k.startsWith(current));
      if (matches.length === 1) {
        inputEl.value = matches[0] + ' ';
      } else if (matches.length > 1) {
        echo(`<div class="dim">${matches.join('  ')}</div>`);
      }
    }
    e.preventDefault();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    openPalette();
    e.preventDefault();
  }
}

/* Palette */
function getCommandCategory(cmd) {
  if (commandStructure[cmd]) {
    return commandStructure[cmd].category || 'system';
  }
  // Check hierarchical
  for (const [verb, nouns] of Object.entries(commandStructure)) {
    if (typeof nouns === 'object' && !nouns.handler) {
      for (const [noun, info] of Object.entries(nouns)) {
        if (info.handler === cmd || info.alias === cmd) {
          return info.category || 'system';
        }
      }
    }
  }
  return 'system';
}

function getCommandDescription(cmd) {
  if (commandDescriptions[cmd]) {
    return commandDescriptions[cmd];
  }
  if (commandStructure[cmd] && commandStructure[cmd].desc) {
    return commandStructure[cmd].desc;
  }
  return 'No description available';
}

function openPalette() {
  paletteEl.hidden = false;
  paletteEl.classList.add('palette-open');
  paletteInputEl.value = '';
  renderPalette([], 0);
  paletteInputEl.focus();
  if (statusModeEl) {
    statusModeEl.textContent = 'palette';
  }
  requestAnimationFrame(() => {
    const items = getAllCommands();
    renderPalette(items, 0);
  });
}

function closePalette() {
  paletteEl.hidden = true;
  paletteEl.classList.remove('palette-open');
  if (statusModeEl) {
    statusModeEl.textContent = 'normal';
  }
  inputEl.focus();
}

function getAllCommands() {
  const commands = Object.keys(commandHandlers).filter(c => !c.includes(' '));
  const hierarchical = [];
  for (const [verb, nouns] of Object.entries(commandStructure)) {
    if (typeof nouns === 'object' && !nouns.handler) {
      for (const [noun, info] of Object.entries(nouns)) {
        hierarchical.push(`${verb} ${noun}`);
      }
    }
  }
  return [...commands, ...hierarchical];
}

function highlightMatch(text, query) {
  if (!query) return escapeHTML(text);
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let result = '';
  let lastIndex = 0;
  let searchIndex = 0;
  
  for (let i = 0; i < lowerText.length; i++) {
    if (searchIndex < lowerQuery.length && lowerText[i] === lowerQuery[searchIndex]) {
      result += escapeHTML(text.substring(lastIndex, i)) + '<mark class="match-highlight">' + escapeHTML(text[i]) + '</mark>';
      lastIndex = i + 1;
      searchIndex++;
    }
  }
  result += escapeHTML(text.substring(lastIndex));
  return result;
}

function renderPalette(items, activeIndex = 0, query = '') {
  paletteListEl.innerHTML = '';
  
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'palette-item palette-empty';
    li.textContent = 'No commands found';
    paletteListEl.appendChild(li);
    paletteListEl.dataset.activeIndex = '0';
    return;
  }
  
  // Group by category
  const categorized = {};
  const recent = appState.recentCommands.slice(-5).reverse();
  
  items.forEach((item, i) => {
    const category = getCommandCategory(item);
    if (!categorized[category]) {
      categorized[category] = [];
    }
    categorized[category].push(item);
  });
  
  let globalIndex = 0;
  Object.keys(categorized).sort().forEach(category => {
    const categoryItems = categorized[category];
    if (categoryItems.length === 0) return;
    
    const categoryHeader = document.createElement('li');
    categoryHeader.className = 'palette-category';
    categoryHeader.textContent = category.charAt(0).toUpperCase() + category.slice(1);
    paletteListEl.appendChild(categoryHeader);
    
    categoryItems.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'palette-item';
      li.role = 'option';
      li.id = `palette-item-${globalIndex}`;
      li.setAttribute('aria-selected', globalIndex === activeIndex ? 'true' : 'false');
      
      const isRecent = recent.includes(item);
      const desc = getCommandDescription(item);
      
      li.innerHTML = `
        <span class="palette-command">${highlightMatch(item, query)}</span>
        ${desc ? `<span class="palette-desc">${escapeHTML(desc)}</span>` : ''}
        ${isRecent ? '<span class="palette-recent">Recent</span>' : ''}
      `;
      
      li.addEventListener('click', () => {
        runCommand(item);
        closePalette();
      });
      
      paletteListEl.appendChild(li);
      globalIndex++;
    });
  });
  
  paletteListEl.dataset.activeIndex = String(activeIndex);
  paletteListEl.dataset.totalItems = String(globalIndex);
}

function filterCommands(query) {
  const allCommands = getAllCommands();
  if (!query) return allCommands;
  const q = query.toLowerCase();
  const starts = allCommands.filter(k => k.toLowerCase().startsWith(q));
  const contains = allCommands.filter(k => !k.toLowerCase().startsWith(q) && k.toLowerCase().includes(q));
  const subseq = allCommands.filter(k => !k.toLowerCase().includes(q) && isSubsequence(q, k.toLowerCase()));
  return [...starts, ...contains, ...subseq];
}

function onPaletteKeyDown(e) {
  if (e.key === 'Escape') { closePalette(); return; }

  const totalItems = Number(paletteListEl.dataset.totalItems || '0');
  if (totalItems === 0) return;
  
  let index = Number(paletteListEl.dataset.activeIndex || '0');
  const query = paletteInputEl.value.trim();

  if (e.key === 'ArrowDown') {
    index = (index + 1) % totalItems;
    const items = filterCommands(query);
    renderPalette(items, index, query);
    scrollToPaletteItem(index);
    e.preventDefault();
    return;
  }
  if (e.key === 'ArrowUp') {
    index = (index - 1 + totalItems) % totalItems;
    const items = filterCommands(query);
    renderPalette(items, index, query);
    scrollToPaletteItem(index);
    e.preventDefault();
    return;
  }
  if (e.key === 'Enter') {
    const items = Array.from(paletteListEl.querySelectorAll('.palette-item:not(.palette-category):not(.palette-empty)'));
    const active = items[index];
    if (active) {
      const cmd = active.querySelector('.palette-command')?.textContent || '';
      if (cmd) {
        runCommand(cmd);
        closePalette();
      }
    }
    return;
  }
}

function scrollToPaletteItem(index) {
  const item = document.getElementById(`palette-item-${index}`);
  if (item) {
    item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

/* Wiring */
inputEl.addEventListener('keydown', onKeyDown);

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    if (document.activeElement !== inputEl) {
      openPalette();
      e.preventDefault();
    }
  }
});

paletteInputEl.addEventListener('input', () => {
  const query = paletteInputEl.value.trim();
  const items = filterCommands(query);
  renderPalette(items, 0, query);
});

paletteInputEl.addEventListener('keydown', onPaletteKeyDown);

paletteEl.addEventListener('click', (e) => {
  if (e.target === paletteEl) closePalette();
});

document.getElementById('app').addEventListener('click', () => inputEl.focus());

/* Deep links */
window.addEventListener('load', async () => {
  // Wait for figlet to be available (check if it's already loaded or wait for it)
  let figletCheckAttempts = 0;
  const maxAttempts = 100; // 10 seconds total
  
  while (!window.figlet && figletCheckAttempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 100));
    figletCheckAttempts++;
    
    // Also check for alternative figlet global names
    if (!window.figlet && window.Figlet) {
      window.figlet = window.Figlet;
      break;
    }
  }
  
  if (window.figlet) {
    // Configure figlet to use CDN fonts
    if (window.figlet.defaults) {
      window.figlet.defaults({
        fontPath: 'https://cdn.jsdelivr.net/npm/figlet@1.7.0/fonts'
      });
    }
  }
  
  // Set CSS variables with defaults first, before config loads
  applyBannerSize();
  
  await loadExternalConfig();
  
  // Update CSS variables after config loads (if it changed)
  applyBannerSize();
  setAccent(CONFIG.defaultAccent);
  
  if (CONFIG.showBannerOnLoad) await renderConfiguredBanner();
  const hash = (window.location.hash || '').replace('#', '').trim();
  if (hash && commandHandlers[hash]) {
    commandHandlers[hash]();
  } else {
    echoText('Type "help" to get started.');
  }
  if (statusModeEl) {
    statusModeEl.textContent = 'normal';
  }
  inputEl.focus();
});

/* Traffic light button handlers */
document.querySelector('.traffic-light-close')?.addEventListener('click', () => {
  echoText('Window close requested (not implemented in web terminal)');
});

document.querySelector('.traffic-light-minimize')?.addEventListener('click', () => {
  echoText('Window minimize requested (not implemented in web terminal)');
});

document.querySelector('.traffic-light-maximize')?.addEventListener('click', () => {
  echoText('Window maximize requested (not implemented in web terminal)');
});



