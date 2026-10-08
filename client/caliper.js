/*! Caliper — click any element, see the parameters that make it, tune them live, send to the agent. */
(() => {
  'use strict';
  if (window.__caliper) return;
  window.__caliper = { booting: true };

  /*__FORMAT__*/

  const script = document.currentScript;
  const ENDPOINT = (
    window.CALIPER_ENDPOINT || (script && script.src ? new URL(script.src).origin : 'http://localhost:4848')
  ).replace(/\/$/, '');
  const STORE_KEY = 'caliper:edits';
  const UI_KEY = 'caliper:ui';
  const SESSION = (() => {
    try {
      let s = sessionStorage.getItem('caliper:session');
      if (!s) sessionStorage.setItem('caliper:session', (s = Math.random().toString(36).slice(2)));
      return s;
    } catch {
      return 'nosession';
    }
  })();

  // ---------------------------------------------------------------- helpers
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k.nodeType ? k : String(k));
    return el;
  };
  const px = (v) => parseFloat(v) || 0;
  const round = (n, d = 2) => Number(Number(n).toFixed(d));
  const fmtNum = (n, d = 0) => String(round(n, d));
  const clamp = (v, a, b) => Math.min(b ?? Infinity, Math.max(a ?? -Infinity, v));
  const cs = (el) => getComputedStyle(el);
  const uid = () => 'e' + Math.random().toString(36).slice(2, 8);
  const lsGet = (k, d) => {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch {
      return d;
    }
  };
  const lsSet = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  };

  const ICON = {
    target:
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3"/></svg>',
    list: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4h10M3 8h10M3 12h6"/></svg>',
    eye: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>',
    eyeOff:
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><path d="M2 14L14 2"/></svg>',
    send: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8l12-5.5L9 14l-1.6-4.6z"/></svg>',
    up: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 13V3M4 7l4-4 4 4"/></svg>',
    down: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3v10M4 9l4 4 4-4"/></svg>',
    x: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    reset: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8a5 5 0 1 0 1.5-3.5M3 2.5V5h2.5"/></svg>',
    expand: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M8 2.5v11M2.5 8h11"/></svg>',
    grip: '<svg viewBox="0 0 8 14" fill="currentColor"><circle cx="2" cy="2" r="1.1"/><circle cx="6" cy="2" r="1.1"/><circle cx="2" cy="7" r="1.1"/><circle cx="6" cy="7" r="1.1"/><circle cx="2" cy="12" r="1.1"/><circle cx="6" cy="12" r="1.1"/></svg>',
    collapse: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 3.5L5.5 8l4.5 4.5"/></svg>',
    trash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5"/></svg>',
  };
  const icon = (name) => h('span', { class: 'ic', html: ICON[name] });

  // ---------------------------------------------------------------- colors
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = 1;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  let probe;
  function probeStyle(prop, value) {
    if (!probe) {
      probe = document.createElement('caliper-probe');
      probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;height:0;overflow:hidden';
    }
    if (!probe.isConnected) document.body.append(probe);
    probe.style.setProperty(prop, '');
    probe.style.setProperty(prop, value);
    return cs(probe).getPropertyValue(prop);
  }
  function toHex(color) {
    if (!color) return null;
    if (/var\(/.test(color)) color = probeStyle('color', color);
    if (color === 'transparent') return 'transparent';
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return 'transparent';
    const hex = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
    return a === 255 ? hex : hex + a.toString(16).padStart(2, '0');
  }

  // ---------------------------------------------------------------- design tokens (CSS custom properties)
  const T = { colors: [], colorByHex: new Map(), text: new Map(), radius: new Map(), weight: new Map(), leading: new Map(), tracking: new Map(), spacingPx: null };
  const tokName = (n) => n.replace(/^--(color|text|radius|font-weight|leading|tracking)-/, '');
  function scanTokens() {
    const names = new Set();
    const walk = (rules) => {
      for (const r of rules) {
        if (r.style && r.selectorText && /(^|,)\s*(:root|:host|html)\b/.test(r.selectorText))
          for (let i = 0; i < r.style.length; i++) if (r.style[i].startsWith('--')) names.add(r.style[i]);
        if (r.cssRules) walk(r.cssRules);
      }
    };
    for (const s of document.styleSheets) {
      try {
        walk(s.cssRules);
      } catch {}
    }
    const rs = cs(document.documentElement);
    for (const n of names) {
      const raw = rs.getPropertyValue(n).trim();
      if (!raw || n.startsWith('--tw-') || n.startsWith('--caliper')) continue;
      if (n === '--spacing') T.spacingPx = px(probeStyle('width', `var(${n})`)) || null;
      else if (/^--text-[\w.]+$/.test(n)) T.text.set(round(px(probeStyle('font-size', `var(${n})`)), 2), tokName(n));
      else if (/^--radius-[\w.]+$/.test(n)) T.radius.set(round(px(probeStyle('border-top-left-radius', `var(${n})`)), 2), tokName(n));
      else if (/^--font-weight-/.test(n)) T.weight.set(Number(raw), tokName(n));
      else if (/^--leading-/.test(n) && !isNaN(Number(raw))) T.leading.set(round(Number(raw), 3), tokName(n));
      else if (/^--tracking-/.test(n) && /em$/.test(raw)) T.tracking.set(round(parseFloat(raw), 4), tokName(n));
      else if (!/^-?[\d.]/.test(raw) && CSS.supports('color', raw) && !/^(inherit|initial|unset|currentcolor)$/i.test(raw)) {
        const hex = toHex(`var(${n})`);
        if (!hex || T.colors.length > 300) continue;
        T.colors.push({ name: n, hex });
        if (!T.colorByHex.has(hex) || n.startsWith('--color-')) T.colorByHex.set(hex, n);
      }
    }
  }
  const isTailwind = () => T.spacingPx != null;
  const WEIGHTS = { 100: 'thin', 200: 'extralight', 300: 'light', 400: 'normal', 500: 'medium', 600: 'semibold', 700: 'bold', 800: 'extrabold', 900: 'black' };

  // Tailwind class suggestion for a value, so the agent can map overrides back to classes.
  function twHint(prop, value, pre) {
    if (!isTailwind()) return null;
    const v = String(value).trim();
    const n = /^-?[\d.]+px$/.test(v) ? parseFloat(v) : null;
    const arb = (pre) => `${pre}-[${v.replace(/\s+/g, '_')}]`;
    const space = (pre) => {
      if (n == null) return arb(pre);
      const k = n / T.spacingPx;
      if (Number.isInteger(round(k * 4, 3))) return `${n < 0 ? '-' : ''}${pre}-${round(Math.abs(k), 2)}`;
      return arb(pre);
    };
    const color = (pre) => {
      const m = v.match(/^var\((--[\w-]+)\)$/);
      if (m) return `${pre}-${tokName(m[1]).replace(/^--/, '')}`;
      const t = T.colorByHex.get(toHex(v));
      return t && t.startsWith('--color-') ? `${pre}-${tokName(t)}` : arb(pre);
    };
    const SP = { 'padding-top': 'pt', 'padding-right': 'pr', 'padding-bottom': 'pb', 'padding-left': 'pl', 'margin-top': 'mt', 'margin-right': 'mr', 'margin-bottom': 'mb', 'margin-left': 'ml', gap: 'gap', width: 'w', height: 'h' };
    if (SP[prop]) return space(pre || SP[prop]);
    const RC = { 'border-top-left-radius': 'rounded-tl', 'border-top-right-radius': 'rounded-tr', 'border-bottom-right-radius': 'rounded-br', 'border-bottom-left-radius': 'rounded-bl' };
    if (RC[prop]) {
      const r = pre || RC[prop];
      if (n >= 9999) return `${r}-full`;
      const t = T.radius.get(n);
      return t ? `${r}-${t}` : arb(r);
    }
    switch (prop) {
      case 'font-size': return T.text.has(n) ? `text-${T.text.get(n)}` : arb('text');
      case 'font-weight': return T.weight.get(Number(v)) ? `font-${T.weight.get(Number(v))}` : WEIGHTS[v] ? `font-${WEIGHTS[v]}` : arb('font');
      case 'line-height': return T.leading.has(round(Number(v), 3)) ? `leading-${T.leading.get(round(Number(v), 3))}` : arb('leading');
      case 'letter-spacing': return T.tracking.has(round(parseFloat(v), 4)) ? `tracking-${T.tracking.get(round(parseFloat(v), 4))}` : arb('tracking');
      case 'color': return color('text');
      case 'background-color': return color('bg');
      case 'border-color': return color('border');
      case 'border-width': return n === 1 ? 'border' : n != null ? `border-${n}` : arb('border');
      case 'opacity': return `opacity-${Math.round(Number(v) * 100)}`;
      case 'text-align': return `text-${v}`;
      case 'text-transform': return v === 'none' ? 'normal-case' : v;
      case 'flex-direction': return v === 'row' ? 'flex-row' : v === 'column' ? 'flex-col' : null;
      case 'align-items': return `items-${v.replace('flex-', '')}`;
      case 'justify-content': return `justify-${v.replace('space-', '').replace('flex-', '')}`;
      case 'font-family': return arb('font');
      case 'box-shadow': return arb('shadow');
    }
    return null;
  }

  // One class list for the whole change: four equal sides become p-4, matching pairs px-/py-.
  const GROUPS = [
    [['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], 'p'], [['padding-left', 'padding-right'], 'px'], [['padding-top', 'padding-bottom'], 'py'],
    [['margin-top', 'margin-right', 'margin-bottom', 'margin-left'], 'm'], [['margin-left', 'margin-right'], 'mx'], [['margin-top', 'margin-bottom'], 'my'],
    [['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'], 'rounded'],
  ];
  function suggestTw(props) {
    if (!isTailwind()) return null;
    const left = new Map(Object.entries(props).map(([p, v]) => [p, v.to]));
    const out = [];
    for (const [ps, pre] of GROUPS) {
      const vals = ps.map((p) => left.get(p));
      if (vals[0] == null || !vals.every((v) => v === vals[0])) continue;
      const hint = twHint(ps[0], vals[0], pre);
      if (hint) out.push(hint), ps.forEach((p) => left.delete(p));
    }
    for (const [p, v] of left) {
      const hint = twHint(p, v);
      if (hint) out.push(hint);
    }
    return out.join(' ') || null;
  }

  // ---------------------------------------------------------------- element identity
  function uniqueSelector(el) {
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.documentElement) {
      if (el.id && /^[A-Za-z][\w-]*$/.test(el.id) && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
        parts.unshift('#' + CSS.escape(el.id));
        break;
      }
      if (el === document.body) {
        parts.unshift('body');
        break;
      }
      const parent = el.parentElement;
      if (!parent) break;
      parts.unshift(`${el.localName}:nth-child(${[...parent.children].indexOf(el) + 1})`);
      el = parent;
    }
    return parts.join(' > ');
  }
  const classSelector = (el) => el.localName + [...el.classList].map((c) => '.' + CSS.escape(c)).join('');
  const snippet = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const safeMatches = (el, sel) => {
    try {
      return el.matches(sel);
    } catch {
      return false;
    }
  };
  const safeAll = (sel) => {
    try {
      return [...document.querySelectorAll(sel)];
    } catch {
      return [];
    }
  };

  const INTERNAL = /^(InnerLayoutRouter|OuterLayoutRouter|LayoutRouter|RenderFromTemplateContext|ScrollAndFocusHandler|InnerScrollAndFocusHandler|.*Boundary.*|.*ErrorBoundary|NotFound.*|HTTPAccessFallback.*|LoadingBoundary|Router|AppRouter|HotReload|ServerRoot|Root|ClientPageRoot|ClientSegmentRoot|Head|ReactDevOverlay|DevOverlay.*|Suspense|Fragment|StrictMode|Provider|Consumer|Context.*|AppDevOverlay.*|ServerInsertedHTMLProvider|Link|LinkComponent|Image|ImageElement|Script)$/;
  function reactInfo(el) {
    let node = el;
    let key;
    while (node && !(key = Object.keys(node).find((k) => k.startsWith('__reactFiber$')))) node = node.parentElement;
    if (!node) return null;
    const fiber = node[key];
    const names = [];
    const nameOf = (t) => {
      if (!t || typeof t === 'string') return null;
      if (typeof t === 'function') return t.displayName || t.name;
      if (typeof t === 'object') return t.displayName || nameOf(t.render) || nameOf(t.type);
      return null;
    };
    const push = (n) => {
      if (n && /^[A-Z]/.test(n) && !INTERNAL.test(n) && !names.includes(n)) names.push(n);
    };
    // Owner chain first: in React 19 dev it includes server components (as { name }).
    let o = fiber._debugOwner;
    for (let i = 0; o && i < 40 && names.length < 5; i++) {
      push(o.name || nameOf(o.type));
      o = o._debugOwner || o.owner;
    }
    let f = fiber.return;
    for (let i = 0; f && i < 80 && names.length < 5; i++) {
      push(nameOf(f.type));
      f = f.return;
    }
    let source = null;
    const ds = fiber._debugSource;
    if (ds) source = `${ds.fileName}:${ds.lineNumber}`;
    else if (fiber._debugStack && fiber._debugStack.stack) {
      const line = fiber._debugStack.stack
        .split('\n')
        .slice(1)
        .find((l) => !/node_modules|react-dom|react\.|jsx-dev-runtime|\bjsxDEV\b|<anonymous>/.test(l) && /\w/.test(l));
      if (line) source = line.trim().replace(/^at\s+/, '').replace(location.origin, '').replace('/_next/static/chunks/', '').slice(0, 160);
    }
    return { names, source };
  }

  function openingTag(el) {
    const attrs = [...el.attributes]
      .filter((a) => !a.name.startsWith('data-caliper') && a.name !== 'style')
      .map((a) => `${a.name}="${a.value.length > 120 ? a.value.slice(0, 120) + '…' : a.value}"`);
    return `<${el.localName}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
  }

  // ---------------------------------------------------------------- state
  const S = {
    inspecting: false,
    hover: null,
    sel: null,
    edit: null,
    edits: [],
    show: true,
    online: false,
    listOpen: false,
    collapsed: new Set(lsGet(UI_KEY, {}).collapsed || []),
    barCollapsed: !!lsGet(UI_KEY, {}).barCollapsed,
    expanded: new Set(),
    colorOpen: null,
    matches: [],
  };

  function newEdit(el) {
    const info = reactInfo(el) || {};
    const text = snippet(el);
    return {
      id: uid(),
      path: location.pathname,
      selector: uniqueSelector(el),
      classSelector: el.classList.length ? classSelector(el) : null,
      scope: 'one',
      tag: el.localName,
      classes: el.getAttribute('class') || '',
      text,
      openingTag: openingTag(el),
      components: info.names || [],
      sourceHint: info.source || null,
      label: (info.names && info.names[0] ? info.names[0] + ' › ' : '') + el.localName + (text && text.length < 40 ? ` "${text}"` : el.classList[0] ? '.' + el.classList[0] : ''),
      props: {},
      note: '',
      saved: false,
      dirty: false,
      enabled: true,
      agent: null, // null | pending | acknowledged | dismissed | modified
      changeId: null,
      reply: null,
      session: SESSION,
      createdAt: Date.now(),
    };
  }
  const hasProps = (e) => Object.keys(e.props).length > 0;
  const editSelector = (e) => (e.scope === 'all' && e.classSelector ? e.classSelector : e.selector);
  const activeHere = (e) => e.scope === 'all' || e.path === location.pathname;
  function findEditFor(el) {
    const here = S.edits.filter(activeHere);
    return here.find((e) => e.scope === 'one' && safeMatches(el, e.selector)) || here.find((e) => e.scope === 'all' && safeMatches(el, e.classSelector));
  }

  function persist() {
    lsSet(STORE_KEY, S.edits.filter((e) => hasProps(e) && (e.saved || e.changeId || e.session === SESSION)));
  }
  function restore() {
    // Saved and sent previews survive reloads; unsaved drafts only within this tab's session.
    S.edits = lsGet(STORE_KEY, []).filter((e) => e && e.props && (e.saved || e.changeId || e.session === SESSION));
  }

  // ---------------------------------------------------------------- overrides
  const styleEl = document.createElement('style');
  styleEl.id = 'caliper-overrides';
  function cssFor(e) {
    const decl = Object.entries(e.props).map(([p, v]) => `  ${p}: ${v.to} !important;`);
    return decl.length ? `${editSelector(e)} {\n${decl.join('\n')}\n}` : '';
  }
  function applyStyles() {
    if (!styleEl.isConnected) (document.head || document.documentElement).append(styleEl);
    styleEl.textContent = S.show ? S.edits.filter((e) => e.enabled && activeHere(e)).map(cssFor).filter(Boolean).join('\n') : '';
  }

  function setProp(prop, value) {
    const e = S.edit;
    const el = S.sel;
    if (!e || !el) return;
    value = String(value).trim();
    if (!value) return;
    if (!e.props[prop]) {
      if (!S.edits.includes(e)) S.edits.push(e);
      e.props[prop] = { from: cs(el).getPropertyValue(prop).trim(), to: value };
    } else e.props[prop].to = value;
    e.enabled = true;
    applyStyles();
    // Back to where it started (by computed value, so 1.5 vs 24px compares right): no change.
    if (cs(el).getPropertyValue(prop).trim() === e.props[prop].from) {
      delete e.props[prop];
      applyStyles();
    }
    touched(e);
  }
  function resetProps(props) {
    const e = S.edit;
    if (!e) return;
    for (const p of props) delete e.props[p];
    applyStyles();
    touched(e);
    syncAll();
  }
  function touched(e) {
    e.dirty = true;
    if (e.agent === 'pending' || e.agent === 'acknowledged' || e.agent === 'dismissed') e.agent = 'modified';
    if (!hasProps(e) && !e.changeId) S.edits = S.edits.filter((x) => x !== e);
    persist();
    syncAll();
    renderBar();
    if (S.listOpen) renderList();
  }

  // ---------------------------------------------------------------- shadow UI
  const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  .ui { font: 500 11.5px/1.3 "Inter", ui-sans-serif, -apple-system, system-ui, sans-serif; color: #e9e9e9; -webkit-font-smoothing: antialiased; font-variant-numeric: tabular-nums; letter-spacing: .005em; }
  .ic { display: inline-flex; width: 14px; height: 14px; } .ic svg { width: 100%; height: 100%; }
  button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
  input, textarea { font: inherit; color: inherit; }

  .hl { position: fixed; pointer-events: none; display: none; }
  .hl.margin { border-style: solid; border-color: rgba(255,155,60,.28); }
  .hl.pad { border-style: solid; border-color: rgba(110,210,120,.32); background: rgba(80,150,255,.22); background-clip: content-box; outline: 1px solid rgba(80,150,255,.9); }
  .hl.sel { outline: 1.5px solid #4f8cff; outline-offset: 0; box-shadow: 0 0 0 4px rgba(79,140,255,.15); }
  .hl.match { outline: 1px dashed rgba(79,140,255,.85); }
  .tag-label { position: fixed; pointer-events: none; display: none; white-space: nowrap; background: #4f8cff; color: #fff; padding: 3px 6px; border-radius: 4px; font-size: 10.5px; max-width: 420px; overflow: hidden; text-overflow: ellipsis; }
  .tag-label b { font-weight: 650; } .tag-label i { font-style: normal; opacity: .75; }

  .bar { position: fixed; display: flex; touch-action: none; user-select: none; cursor: grab; align-items: center; gap: 2px; padding: 4px; background: rgba(20,20,20,.94); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.35), 0 0 0 .5px rgba(0,0,0,.6); }
  .bar.dragging { cursor: grabbing; box-shadow: 0 14px 40px rgba(0,0,0,.45), 0 0 0 .5px rgba(0,0,0,.6); }
  .bar.dragging * { cursor: grabbing !important; }
  .grip { display: inline-flex; width: 14px; height: 30px; align-items: center; justify-content: center; color: #5a5a5a; margin: 0 1px 0 2px; }
  .bar:hover .grip { color: #8a8a8a; }
  .bar.collapsed { padding: 4px; border-radius: 12px; }
  .bar.collapsed .bb { padding: 0 8px; }
  .badge { min-width: 16px; height: 16px; padding: 0 4px; border-radius: 99px; background: #ffb02e; color: #111; font-size: 10px; font-weight: 650; display: inline-flex; align-items: center; justify-content: center; }
  .bb { cursor: pointer; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 9px; border-radius: 8px; color: #bdbdbd; }
  .bb:hover { background: rgba(255,255,255,.07); color: #fff; }
  .bb.on { background: #4f8cff; color: #fff; }
  .bb.primary { background: #fff; color: #111; } .bb.primary:hover { background: #e6e6e6; }
  .bb[disabled] { opacity: .35; pointer-events: none; }
  .kbd { font-size: 10px; opacity: .55; }
  .count { min-width: 16px; text-align: center; }
  .sep { width: 1px; height: 18px; background: rgba(255,255,255,.1); margin: 0 3px; }
  .net { width: 6px; height: 6px; border-radius: 50%; background: #666; margin: 0 8px 0 6px; } .net.ok { background: #44d17a; }

  .panel { position: fixed; width: 292px; max-height: calc(100vh - 90px); display: flex; flex-direction: column; background: rgba(20,20,20,.96); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,.08); border-radius: 14px; box-shadow: 0 16px 50px rgba(0,0,0,.45), 0 0 0 .5px rgba(0,0,0,.6); overflow: hidden; }
  .head { padding: 10px 10px 8px 12px; border-bottom: 1px solid rgba(255,255,255,.06); cursor: grab; user-select: none; }
  .head:active { cursor: grabbing; }
  .hrow { display: flex; align-items: center; gap: 6px; }
  .title { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 6px; overflow: hidden; }
  .title .t { font-weight: 650; color: #fff; font-size: 12.5px; white-space: nowrap; }
  .title .c { color: #8a8a8a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px; }
  .crumbs { color: #8a8a8a; margin-top: 3px; font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .crumbs b { color: #c9c9c9; font-weight: 550; }
  .ib { width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; color: #9a9a9a; flex: none; }
  .ib:hover { background: rgba(255,255,255,.08); color: #fff; }
  .scope { display: flex; margin-top: 8px; background: #0f0f0f; border-radius: 7px; padding: 2px; }
  .scope button { flex: 1; height: 22px; border-radius: 5px; color: #9a9a9a; font-size: 11px; }
  .scope button.on { background: #2b2b2b; color: #fff; }
  .scope button[disabled] { opacity: .35; cursor: default; }

  .body { overflow: auto; overscroll-behavior: contain; padding: 4px 0 6px; scrollbar-width: thin; scrollbar-color: #333 transparent; }
  .sec + .sec { border-top: 1px solid rgba(255,255,255,.05); }
  .sh { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 9px 12px 6px; color: #8a8a8a; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; font-weight: 600; }
  .sh:hover { color: #ddd; }
  .sh .chev { transition: transform .15s; width: 10px; height: 10px; display: inline-flex; } .sh .chev svg { width: 100%; height: 100%; }
  .sec.closed .chev { transform: rotate(-90deg); }
  /* Height animates via grid rows 1fr ↔ 0fr (works for any content height, no measuring). */
  .sbw { display: grid; grid-template-rows: 1fr; transition: grid-template-rows .26s cubic-bezier(.2,.8,.2,1); }
  .sbi { min-height: 0; overflow: hidden; }
  .sbi > .sb { transition: opacity .2s ease, transform .26s cubic-bezier(.2,.8,.2,1); }
  .sec.closed .sbw { grid-template-rows: 0fr; }
  .sec.closed .sbi > .sb { opacity: 0; transform: translateY(-4px); }
  .sec.closed .sbi { visibility: hidden; transition: visibility 0s .26s; }
  .sh .chev { transition: transform .26s cubic-bezier(.2,.8,.2,1) !important; }
  @media (prefers-reduced-motion: reduce) { .sbw, .sbi > .sb, .sh .chev { transition: none !important; } }
  .sb { padding: 0 10px 6px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }

  .scrub { min-width: 0; position: relative; height: 26px; border-radius: 7px; background: #262626; display: flex; align-items: center; gap: 6px; padding: 0 8px; cursor: ew-resize; user-select: none; overflow: hidden; outline: none; }
  .scrub:hover { background: #2c2c2c; }
  .scrub:focus-visible, .seg:focus-visible { box-shadow: 0 0 0 1.5px #4f8cff; outline: none; }
  .seg { outline: none; }
  .scrub.drag { background: #2f2f2f; }
  .scrub .fill { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(255,255,255,.07); pointer-events: none; }
  .scrub.drag .fill { background: rgba(79,140,255,.28); }
  .scrub .lbl { position: relative; color: #a8a8a8; white-space: nowrap; }
  .scrub .tok { position: relative; color: #6f9bff; font-size: 10.5px; margin-left: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .scrub .val { position: relative; color: #fff; white-space: nowrap; }
  .scrub .tok:empty + .val { margin-left: auto; }
  .scrub .u { color: #777; margin-left: 1px; }
  .scrub .num-in { position: relative; width: 70px; margin-left: auto; text-align: right; background: #111; border: 1px solid #4f8cff; border-radius: 4px; padding: 1px 4px; outline: none; color: #fff; cursor: text; }
  .dot { position: relative; width: 6px; height: 6px; border-radius: 50%; background: #ffb02e; display: none; flex: none; cursor: pointer; }
  .changed > .dot, .changed > .rl > .dot { display: inline-block; }
  .dot:hover { box-shadow: 0 0 0 3px rgba(255,176,46,.3); }
  .mini { padding: 0 6px; gap: 4px; } .mini .lbl { color: #777; font-size: 10px; }

  .grid2, .grid4 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 4px; }
  .quad .qh { display: flex; align-items: center; justify-content: space-between; height: 20px; color: #a8a8a8; padding: 0 2px 0 4px; }
  .quad .qh .rl { display: flex; align-items: center; gap: 6px; }

  .row { display: flex; align-items: center; gap: 8px; min-height: 26px; }
  .row > .rl { width: 58px; flex: none; color: #a8a8a8; display: flex; align-items: center; gap: 5px; padding-left: 4px; white-space: nowrap; }
  .row > .ctl { flex: 1; min-width: 0; display: flex; align-items: center; gap: 4px; }
  .seg { display: flex; flex: 1; background: #262626; border-radius: 7px; padding: 2px; }
  .seg button { flex: 1; height: 22px; border-radius: 5px; color: #9a9a9a; font-size: 10.5px; white-space: nowrap; }
  .seg button:hover { color: #fff; }
  .seg button.on { background: #444; color: #fff; }
  .txt { flex: 1; min-width: 0; height: 26px; background: #262626; border: 1px solid transparent; border-radius: 7px; padding: 0 8px; outline: none; color: #fff; }
  .txt:focus { border-color: #4f8cff; background: #1c1c1c; }
  .sw { width: 26px; height: 26px; border-radius: 7px; flex: none; box-shadow: inset 0 0 0 1px rgba(255,255,255,.14); background-image: linear-gradient(45deg,#555 25%,transparent 25%,transparent 75%,#555 75%),linear-gradient(45deg,#555 25%,transparent 25%,transparent 75%,#555 75%); background-size: 8px 8px; background-position: 0 0, 4px 4px; position: relative; overflow: hidden; }
  .sw i { position: absolute; inset: 0; }
  .native { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }
  .ctl .tok { color: #6f9bff; font-size: 10.5px; white-space: nowrap; max-width: 80px; overflow: hidden; text-overflow: ellipsis; }
  .pop { background: #111; border-radius: 8px; padding: 8px; display: grid; gap: 8px; }
  .pop .sws { display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px; max-height: 120px; overflow: auto; }
  .pop .sws button { aspect-ratio: 1; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); }
  .pop .sws button:hover { box-shadow: 0 0 0 1.5px #fff; }
  .pop .pick { height: 24px; border-radius: 6px; background: #262626; color: #ccc; }
  .pop .pick:hover { background: #333; color: #fff; }
  .muted { color: #777; font-size: 10.5px; }

  .foot { border-top: 1px solid rgba(255,255,255,.06); padding: 8px 10px 10px; display: grid; gap: 8px; }
  .note { width: 100%; resize: none; height: 46px; background: #262626; border: 1px solid transparent; border-radius: 8px; padding: 6px 8px; outline: none; color: #fff; line-height: 1.35; }
  .note:focus { border-color: #4f8cff; background: #1c1c1c; }
  .note::placeholder { color: #707070; }
  .status { color: #8a8a8a; font-size: 10.5px; min-height: 13px; }
  .status.agent { color: #6f9bff; } .status.warn { color: #ffb02e; }
  .acts { display: flex; gap: 6px; }
  .btn { height: 30px; padding: 0 10px; border-radius: 8px; background: #2a2a2a; color: #ddd; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
  .btn:hover { background: #333; color: #fff; }
  .btn.primary { flex: 1; background: #fff; color: #111; font-weight: 600; } .btn.primary:hover { background: #e6e6e6; }
  .btn[disabled] { opacity: .35; pointer-events: none; }

  .list { position: fixed; width: 340px; max-height: 50vh; display: flex; flex-direction: column; background: rgba(20,20,20,.96); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,.08); border-radius: 14px; box-shadow: 0 16px 50px rgba(0,0,0,.45); overflow: hidden; }
  .list .lh { padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,.06); color: #fff; font-weight: 600; }
  .list .items { overflow: auto; padding: 4px; }
  .item { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 8px; }
  .item:hover { background: rgba(255,255,255,.05); }
  .item .main { flex: 1; min-width: 0; cursor: pointer; }
  .item .nm { color: #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item .sub { color: #808080; font-size: 10.5px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item.off .nm { color: #777; text-decoration: line-through; }
  .chk { width: 14px; height: 14px; accent-color: #4f8cff; flex: none; cursor: pointer; }
  .pill { font-size: 10px; padding: 1px 6px; border-radius: 99px; background: #2a2a2a; color: #aaa; }
  .pill.blue { background: rgba(79,140,255,.2); color: #8fb3ff; } .pill.amber { background: rgba(255,176,46,.16); color: #ffc66b; } .pill.green { background: rgba(68,209,122,.16); color: #6fe39a; }
  .empty { padding: 18px 12px; color: #808080; text-align: center; line-height: 1.5; }

  .toast { position: fixed; left: 50%; top: 16px; transform: translateX(-50%); background: #fff; color: #111; padding: 8px 12px; border-radius: 9px; box-shadow: 0 8px 30px rgba(0,0,0,.3); font-weight: 550; transition: opacity .3s, transform .3s; max-width: 80vw; }
  .toast.out { opacity: 0; transform: translate(-50%, -6px); }
  `;

  const host = document.createElement('caliper-root');
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;';
  const shadow = host.attachShadow({ mode: 'open' });
  const ui = h('div', { class: 'ui' });
  shadow.append(h("style", {}, STYLES), ui);

  const marginBox = h('div', { class: 'hl margin' });
  const padBox = h('div', { class: 'hl pad' });
  const hoverLabel = h('div', { class: 'tag-label' });
  const selBox = h('div', { class: 'hl sel' });
  const matchLayer = h('div');
  const panel = h('div', { class: 'panel', hidden: true });
  const list = h('div', { class: 'list', hidden: true });
  const bar = h('div', { class: 'bar' });
  ui.append(matchLayer, marginBox, padBox, selBox, hoverLabel, panel, list, bar);

  const isOurs = (e) => e.composedPath().includes(host);

  function toast(msg, ms = 2400) {
    const t = h('div', { class: 'toast' }, msg);
    // Opposite edge from the toolbar, so it never covers it.
    const r = bar.getBoundingClientRect();
    if (r.top < innerHeight / 2) Object.assign(t.style, { top: 'auto', bottom: '16px' });
    ui.append(t);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  }

  // Does this element own its text, or does it just contain other elements that do? Only the
  // owner gets Typography: direct text, or text wrapped only in text-level tags (<span>, <a>,
  // <strong>…), as in a button with a label span or a paragraph with a link. A card holding an
  // <h3> and a <p> doesn't own their type; select those to tune it.
  const TEXT_LEVEL = /^(a|abbr|b|bdi|bdo|cite|code|data|dfn|em|i|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var|label|font|del|ins)$/;
  const NO_TEXT_INPUT = /^(checkbox|radio|range|color|file|hidden|image|submit|reset|button)$/;
  // A text-level tag counts as its own component when it isn't flowing inline and has a box look.
  // (Inline <code> with a background inside a paragraph is still the paragraph's text.)
  function isBox(n) {
    const c = cs(n);
    if (c.display === 'inline' || c.display === 'contents') return false;
    const painted = (v) => v && v !== 'transparent' && !/rgba?\([^)]*,\s*0\)$/.test(v) && !/\/\s*0\)$/.test(v);
    return ['Top', 'Right', 'Bottom', 'Left'].some((sd) => px(c['padding' + sd]) > 0 || px(c['border' + sd + 'Width']) > 0) || painted(c.backgroundColor) || c.backgroundImage !== 'none';
  }
  function ownsText(el) {
    const tag = el.localName;
    if (el instanceof SVGElement) return tag === 'text' || tag === 'tspan' || tag === 'textPath';
    if (tag === 'textarea' || tag === 'select') return true;
    if (tag === 'input') return !NO_TEXT_INPUT.test(el.type) || ((el.type === 'submit' || el.type === 'button' || el.type === 'reset') && !!el.value);
    let found = false;
    const walk = (node) => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) {
          if (n.textContent.trim()) found = true;
        } else if (n.nodeType === 1 && (n.textContent || '').trim()) {
          if (!TEXT_LEVEL.test(n.localName)) return false; // text lives in a block of its own
          if (isBox(n)) return false; // an <a>/<span> styled as its own component (a button, a chip)
          if (walk(n) === false) return false;
        }
      }
    };
    return walk(el) !== false && found;
  }

  // ---------------------------------------------------------------- overlays
  function sides(c, k) {
    return ['Top', 'Right', 'Bottom', 'Left'].map((s) => px(c[k.replace('$', s)]));
  }
  function place(box, r) {
    Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  }
  function typeSummary(c) {
    const fam = c.fontFamily.split(',')[0].replace(/["']/g, '').replace(/^__(.+?)_[\w]+$/, '$1');
    const lh = c.lineHeight === 'normal' ? 'normal' : round(px(c.lineHeight), 1);
    return `${fam} ${round(px(c.fontSize), 1)}/${lh} · ${c.fontWeight}`;
  }
  function drawHover() {
    const el = S.inspecting ? S.hover : null;
    if (!el || el === S.sel || !el.isConnected) {
      marginBox.style.display = padBox.style.display = hoverLabel.style.display = 'none';
      return;
    }
    const r = el.getBoundingClientRect();
    const c = cs(el);
    const m = sides(c, 'margin$').map((v) => Math.max(0, v));
    const b = sides(c, 'border$Width');
    const p = sides(c, 'padding$');
    place(marginBox, { left: r.left - m[3], top: r.top - m[0], width: r.width + m[1] + m[3], height: r.height + m[0] + m[2] });
    marginBox.style.borderWidth = m.map((v) => v + 'px').join(' ');
    place(padBox, { left: r.left + b[3], top: r.top + b[0], width: Math.max(0, r.width - b[1] - b[3]), height: Math.max(0, r.height - b[0] - b[2]) });
    padBox.style.borderWidth = p.map((v) => Math.max(0, v) + 'px').join(' ');
    const hasText = ownsText(el);
    hoverLabel.innerHTML = '';
    hoverLabel.append(
      h('b', {}, el.localName + (el.classList[0] ? '.' + [...el.classList].slice(0, 3).join('.') : '')),
      ' ',
      h('i', {}, `${round(r.width, 0)}×${round(r.height, 0)}${hasText ? ' · ' + typeSummary(c) : ''}`),
    );
    hoverLabel.style.display = 'block';
    const ly = r.top > 26 ? r.top - 23 : r.bottom + 4;
    hoverLabel.style.left = clamp(r.left, 4, innerWidth - hoverLabel.offsetWidth - 4) + 'px';
    hoverLabel.style.top = clamp(ly, 4, innerHeight - 24) + 'px';
  }
  let matchTick = 0;
  function drawSel() {
    if (!S.sel) {
      selBox.style.display = 'none';
      matchLayer.innerHTML = '';
      return;
    }
    if (!S.sel.isConnected) {
      // Re-rendered (HMR, state change): find it again by its selector.
      const again = S.edit && safeAll(S.edit.selector)[0];
      if (again) S.sel = again;
      else return deselect();
    }
    place(selBox, S.sel.getBoundingClientRect());
    if (S.edit.scope === 'all' && S.edit.classSelector) {
      if (matchTick++ % 20 === 0) S.matches = safeAll(S.edit.classSelector).filter((x) => x !== S.sel).slice(0, 60);
      while (matchLayer.children.length < S.matches.length) matchLayer.append(h('div', { class: 'hl match' }));
      while (matchLayer.children.length > S.matches.length) matchLayer.lastChild.remove();
      S.matches.forEach((m, i) => place(matchLayer.children[i], m.getBoundingClientRect()));
    } else matchLayer.innerHTML = '';
  }
  (function loop() {
    try {
      drawHover();
      drawSel();
    } catch {}
    requestAnimationFrame(loop);
  })();

  // ---------------------------------------------------------------- controls
  let controls = [];
  const syncAll = () => {
    controls.forEach((c) => c.sync());
    syncFoot();
  };
  const isChanged = (props) => !!S.edit && props.some((p) => S.edit.props[p]);

  // Drag-to-scrub number with click-to-type. spec: label, get(cs) -> number|null, set(n|string),
  // props (for the changed dot), min, max (fill range), hardMax, step, dec, unit, tok(n), cap.
  function scrubber(spec, mini) {
    const fill = h('div', { class: 'fill' });
    const val = h('span', { class: 'val' });
    const tok = h('span', { class: 'tok' });
    const dot = h('span', { class: 'dot', title: 'Reset' });
    const box = h('div', { class: 'scrub' + (mini ? ' mini' : ''), tabindex: 0, 'data-param': '', title: spec.props.join(', ') }, fill, dot, h('span', { class: 'lbl' }, spec.label), tok, val);
    let cur = null;
    let busy = false;
    const show = (v) => {
      cur = v;
      val.innerHTML = '';
      if (v == null) {
        val.append(spec.nullText || '—');
        fill.style.width = '0%';
      } else {
        const t = spec.fmt ? spec.fmt(v) : fmtNum(v, spec.dec || 0);
        val.append(t, spec.unit && /\d$/.test(t) ? h('span', { class: 'u' }, spec.unit) : '');
        fill.style.width = clamp(((v - spec.min) / (spec.max - spec.min)) * 100, 0, 100) + '%';
      }
      tok.textContent = (v != null && spec.tok && spec.tok(v)) || '';
    };
    const commit = (v) => {
      v = clamp(round(Math.round(v / spec.step) * spec.step, spec.dec || 0), spec.hardMin ?? spec.min, spec.hardMax);
      show(v);
      spec.set(v);
    };
    box.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 || box.querySelector('input')) return;
      if (ev.target === dot) {
        resetProps(spec.props);
        return;
      }
      ev.preventDefault();
      box.focus();
      box.setPointerCapture(ev.pointerId);
      const sx = ev.clientX;
      let sv = cur ?? spec.nullStart ?? 0;
      if (spec.cap && sv > spec.cap) sv = spec.cap;
      let moved = false;
      const move = (e2) => {
        const dx = e2.clientX - sx;
        if (!moved && Math.abs(dx) < 3) return;
        moved = busy = true;
        box.classList.add('drag');
        const mult = (e2.shiftKey ? 10 : 1) * (e2.altKey ? 0.1 : 1);
        commit(sv + (dx - Math.sign(dx) * 3) * spec.step * (spec.perPx || 1) * mult);
      };
      const up = () => {
        box.removeEventListener('pointermove', move);
        box.removeEventListener('pointerup', up);
        box.removeEventListener('pointercancel', up);
        box.classList.remove('drag');
        busy = false;
        if (!moved) edit();
        else sync();
      };
      box.addEventListener('pointermove', move);
      box.addEventListener('pointerup', up);
      box.addEventListener('pointercancel', up);
    });
    box.addEventListener('keydown', (e) => {
      if (e.target !== box) return;
      const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
      if (d) {
        e.preventDefault();
        e.stopPropagation();
        commit((cur ?? spec.nullStart ?? 0) + d * spec.step * (e.shiftKey ? 10 : 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        edit();
      } else if (/^[\d.-]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Tabbed in and typing: start editing with that keystroke.
        e.preventDefault();
        edit(e.key);
      }
    });
    function edit(initial) {
      const inp = h('input', { class: 'num-in', value: initial ?? (cur == null ? '' : fmtNum(cur, spec.dec || 0)), spellcheck: false });
      val.replaceWith(inp);
      tok.hidden = true;
      busy = true;
      inp.focus();
      if (initial == null) inp.select();
      else inp.setSelectionRange(inp.value.length, inp.value.length);
      let done = false;
      const finish = (ok, refocus = true) => {
        if (done) return;
        done = true;
        busy = false;
        inp.replaceWith(val);
        tok.hidden = false;
        const raw = inp.value.trim();
        if (ok && raw !== '') {
          const n = Number(raw);
          if (Number.isFinite(n)) commit(n);
          else spec.set(raw); // any CSS value: 1.5rem, auto, var(--x)…
        }
        sync();
        if (refocus) box.focus();
      };
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      });
      // Focus moving on (Tab, a click elsewhere) commits without pulling focus back.
      inp.addEventListener('blur', (e) => finish(true, !e.relatedTarget));
      inp.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    function sync() {
      box.classList.toggle('changed', isChanged(spec.props));
      if (!busy && S.sel) show(spec.get(cs(S.sel)));
    }
    controls.push({ sync });
    return box;
  }

  const readPx = (prop) => (c) => px(c.getPropertyValue(prop));
  const num = (label, prop, o = {}) =>
    scrubber({ label, props: [prop], get: readPx(prop), set: (v) => setProp(prop, typeof v === 'number' ? v + 'px' : v), unit: 'px', step: 1, min: 0, max: 100, hardMin: 0, ...o });

  // Four sides: collapsed shows X/Y (or one "all"), expanded shows each side.
  function quad(label, props, o = {}) {
    const key = label;
    const wrap = h('div', { class: 'quad' });
    const dot = h('span', { class: 'dot', title: 'Reset', onclick: () => resetProps(props) });
    const head = h('div', { class: 'qh' }, h('span', { class: 'rl' }, dot, label), h('button', { class: 'ib', title: 'Individual sides', onclick: () => { S.expanded.has(key) ? S.expanded.delete(key) : S.expanded.add(key); renderPanel(); } }, icon('expand')));
    const mk = (lbl, ps) =>
      scrubber({ label: lbl, props: ps, get: readPx(ps[0]), set: (v) => ps.forEach((p) => setProp(p, typeof v === 'number' ? v + 'px' : v)), unit: 'px', step: 1, min: 0, max: 64, hardMin: o.allowNegative ? undefined : 0, ...o }, true);
    let grid;
    if (S.expanded.has(key)) grid = h('div', { class: 'grid4' }, o.corners ? [mk('TL', [props[0]]), mk('TR', [props[1]]), mk('BL', [props[3]]), mk('BR', [props[2]])] : [mk('T', [props[0]]), mk('R', [props[1]]), mk('B', [props[2]]), mk('L', [props[3]])]);
    else if (o.corners) grid = h('div', {}, mk('All', props));
    else grid = h('div', { class: 'grid2' }, mk('X', [props[1], props[3]]), mk('Y', [props[0], props[2]]));
    wrap.append(head, grid);
    controls.push({ sync: () => head.classList.toggle('changed', isChanged(props)) });
    return wrap;
  }

  function row(label, props, ctl) {
    const dot = h('span', { class: 'dot', title: 'Reset', onclick: () => resetProps(props) });
    const r = h('div', { class: 'row' }, h('span', { class: 'rl' }, dot, label), h('div', { class: 'ctl' }, ctl));
    controls.push({ sync: () => r.classList.toggle('changed', isChanged(props)) });
    return r;
  }

  function seg(label, prop, options, read) {
    const btns = options.map(([v, l]) => h('button', { title: v, onclick: () => setProp(prop, v) }, l));
    const group = h('div', { class: 'seg', tabindex: 0, 'data-param': '', title: prop + ' (←/→)' }, btns);
    const r = row(label, [prop], group);
    let idx = -1;
    group.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      const n = options.length;
      setProp(prop, options[idx < 0 ? (d > 0 ? 0 : n - 1) : (idx + d + n) % n][0]);
    });
    controls.push({ sync: () => { const cur = (read || ((c) => c.getPropertyValue(prop)))(cs(S.sel)); idx = options.findIndex((o) => o[0] === cur); btns.forEach((b, i) => b.classList.toggle('on', i === idx)); } });
    return r;
  }

  function text(label, prop, o = {}) {
    const inp = h('input', { class: 'txt', spellcheck: false, 'data-param': '', list: o.list || null });
    inp.addEventListener('change', () => setProp(prop, inp.value));
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); });
    controls.push({ sync: () => { if (shadow.activeElement !== inp) inp.value = (o.read || ((c) => c.getPropertyValue(prop)))(cs(S.sel)); } });
    return row(label, [prop], inp);
  }

  function color(label, prop) {
    const sw = h('button', { class: 'sw', title: 'Tokens & picker' }, h('i'));
    const hex = h('input', { class: 'txt', spellcheck: false, 'data-param': '' });
    const tok = h('span', { class: 'tok' });
    const native = h('input', { type: 'color', class: 'native' });
    const r = row(label, [prop], [sw, hex, tok, native]);
    const pop = h('div', { class: 'pop', hidden: S.colorOpen !== prop });
    const wrap = h('div', {}, r, pop);
    const setVal = (v) => setProp(prop, v);
    if (S.colorOpen === prop) {
      pop.append(
        T.colors.length
          ? h('div', { class: 'sws' }, T.colors.map((t) => h('button', { title: t.name, style: `background:var(${t.name})`, onclick: () => setVal(`var(${t.name})`) })))
          : h('div', { class: 'muted' }, 'No color tokens found on :root'),
        h('button', { class: 'pick', onclick: () => { try { native.showPicker(); } catch { native.click(); } } }, 'Custom color…'),
      );
    }
    sw.addEventListener('click', () => { S.colorOpen = S.colorOpen === prop ? null : prop; renderPanel(); });
    native.addEventListener('input', () => setVal(native.value));
    hex.addEventListener('change', () => setVal(/^[0-9a-f]{3,8}$/i.test(hex.value.trim()) ? '#' + hex.value.trim() : hex.value));
    hex.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') hex.blur(); });
    controls.push({
      sync: () => {
        const v = cs(S.sel).getPropertyValue(prop);
        const hx = toHex(v);
        sw.firstChild.style.background = v;
        const to = S.edit.props[prop] && S.edit.props[prop].to;
        const m = to && to.match(/^var\((--[\w-]+)\)$/);
        const t = m ? m[1] : T.colorByHex.get(hx);
        if (shadow.activeElement !== hex) hex.value = hx || v;
        tok.textContent = t ? tokName(t).replace(/^--/, '') : '';
        if (hx && hx.length === 7) native.value = hx;
      },
    });
    return wrap;
  }

  function section(name, rows) {
    const sec = h('div', { class: 'sec' + (S.collapsed.has(name) ? ' closed' : '') });
    sec.append(
      h('button', { class: 'sh', onclick: () => { S.collapsed.has(name) ? S.collapsed.delete(name) : S.collapsed.add(name); lsSet(UI_KEY, { ...lsGet(UI_KEY, {}), collapsed: [...S.collapsed] }); sec.classList.toggle('closed'); } }, name, h('span', { class: 'chev', html: '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2.5 4l2.5 2.5L7.5 4"/></svg>' })),
      h('div', { class: 'sbw' }, h('div', { class: 'sbi' }, h('div', { class: 'sb' }, rows))),
    );
    return sec;
  }

  const fontFamilies = () => {
    const set = new Set();
    try {
      document.fonts.forEach((f) => set.add(f.family.replace(/^["']|["']$/g, '')));
    } catch {}
    return [...set];
  };
  const leading = (c) => {
    if (c.lineHeight === 'normal') return null;
    return /px$/.test(c.lineHeight) ? round(px(c.lineHeight) / px(c.fontSize), 3) : Number(c.lineHeight);
  };

  function sectionsFor(el) {
    const c = cs(el);
    const out = [];
    if (ownsText(el)) {
      const fams = fontFamilies();
      out.push(
        section('Typography', [
          h('datalist', { id: 'caliper-fonts' }, fams.map((f) => h('option', { value: f }))),
          text('Font', 'font-family', { list: 'caliper-fonts' }),
          h('div', { class: 'grid2' },
            scrubber({ label: 'Size', props: ['font-size'], get: readPx('font-size'), set: (v) => setProp('font-size', typeof v === 'number' ? v + 'px' : v), unit: 'px', step: 1, min: 8, max: 96, hardMin: 1, tok: (v) => T.text.get(round(v, 2)) }),
            scrubber({ label: 'Weight', props: ['font-weight'], get: (c) => Number(c.fontWeight), set: (v) => setProp('font-weight', v), step: 10, min: 100, max: 900, hardMin: 1, hardMax: 1000, tok: (v) => T.weight.get(v) || WEIGHTS[v] || '' }),
          ),
          h('div', { class: 'grid2' },
            scrubber({ label: 'Leading', props: ['line-height'], get: leading, set: (v) => setProp('line-height', v), step: 0.01, dec: 2, min: 0.8, max: 2.2, hardMin: 0, nullText: 'normal', nullStart: 1.2, tok: (v) => T.leading.get(round(v, 3)) || '' }),
            scrubber({ label: 'Tracking', props: ['letter-spacing'], get: (c) => (c.letterSpacing === 'normal' ? 0 : round(px(c.letterSpacing) / px(c.fontSize), 4)), set: (v) => setProp('letter-spacing', typeof v === 'number' ? v + 'em' : v), step: 0.001, dec: 3, min: -0.1, max: 0.2, unit: 'em', hardMin: -1, tok: (v) => T.tracking.get(round(v, 4)) || `${round(v * 100, 1)}%` }),
          ),
          color('Color', 'color'),
          seg('Align', 'text-align', [['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['justify', 'Justify']], (c) => ({ start: 'left', end: 'right' })[c.textAlign] || c.textAlign),
          seg('Case', 'text-transform', [['none', 'Aa'], ['uppercase', 'AA'], ['lowercase', 'aa'], ['capitalize', 'Ab']]),
        ]),
      );
    }
    if (/flex|grid/.test(c.display)) {
      const flex = /flex/.test(c.display);
      out.push(
        section('Layout', [
          flex && seg('Direction', 'flex-direction', [['row', 'Row'], ['column', 'Column']]),
          seg('Align', 'align-items', [['flex-start', 'Start'], ['center', 'Center'], ['flex-end', 'End'], ['stretch', 'Stretch']], (c) => ({ start: 'flex-start', end: 'flex-end', normal: 'stretch' })[c.alignItems] || c.alignItems),
          seg('Justify', 'justify-content', [['flex-start', 'Start'], ['center', 'Center'], ['flex-end', 'End'], ['space-between', 'Between']], (c) => ({ start: 'flex-start', end: 'flex-end', normal: 'flex-start' })[c.justifyContent] || c.justifyContent),
          num('Gap', 'gap', { get: (c) => px(c.columnGap === 'normal' ? 0 : c.columnGap), tok: (v) => T.spacingPx && Number.isInteger(round((v / T.spacingPx) * 4, 3)) ? String(round(v / T.spacingPx, 2)) : '' }),
        ]),
      );
    }
    const spTok = (v) => (T.spacingPx && Number.isInteger(round((v / T.spacingPx) * 4, 3)) ? String(round(v / T.spacingPx, 2)) : '');
    out.push(
      section('Spacing', [
        quad('Padding', ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], { tok: spTok }),
        quad('Margin', ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'], { allowNegative: true, min: -32, tok: spTok }),
      ]),
      // width/height do nothing on inline boxes (a <span> or <a> in running text).
      !(c.display === 'inline' && !/^(img|svg|video|canvas|iframe|input|textarea|select|object|embed)$/.test(el.localName)) &&
      section('Size', [
        h('div', { class: 'grid2' },
          num('W', 'width', { max: 800, tok: spTok }),
          num('H', 'height', { max: 400, tok: spTok }),
        ),
      ]),
      section('Shape', [
        quad('Radius', ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'], { corners: true, max: 48, cap: 200, fmt: (v) => (v >= 9999 ? 'full' : fmtNum(v)), tok: (v) => (v >= 9999 ? '' : T.radius.get(round(v, 2)) || '') }),
        num('Border', 'border-width', {
          get: readPx('border-top-width'),
          max: 8,
          set: (v) => {
            if (S.sel && cs(S.sel).borderTopStyle === 'none') setProp('border-style', 'solid');
            setProp('border-width', typeof v === 'number' ? v + 'px' : v);
          },
        }),
        color('Border', 'border-color'),
      ]),
      section('Fill', [
        color('Fill', 'background-color'),
        scrubber({ label: 'Opacity', props: ['opacity'], get: (c) => Number(c.opacity), set: (v) => setProp('opacity', v), step: 0.01, dec: 2, min: 0, max: 1, hardMax: 1, fmt: (v) => Math.round(v * 100), unit: '%', perPx: 1 }),
        text('Shadow', 'box-shadow'),
      ]),
    );
    return out.filter(Boolean);
  }

  // ---------------------------------------------------------------- panel
  let panelPos = lsGet(UI_KEY, {}).pos || null;
  let statusEl;
  let footBtns = {};

  function renderPanel() {
    const keep = panel.querySelector('.body');
    const scroll = keep ? keep.scrollTop : 0;
    panel.innerHTML = '';
    controls = [];
    if (!S.sel) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const e = S.edit;
    const el = S.sel;
    const count = e.classSelector ? safeAll(e.classSelector).length : 0;

    const head = h('div', { class: 'head' },
      h('div', { class: 'hrow' },
        h('div', { class: 'title' }, h('span', { class: 't' }, `<${el.localName}>`), h('span', { class: 'c', title: e.classes }, e.classes || 'no classes')),
        h('button', { class: 'ib', title: 'Select parent (⌥↑)', onclick: () => selectRel('up') }, icon('up')),
        h('button', { class: 'ib', title: 'Select first child (⌥↓)', onclick: () => selectRel('down') }, icon('down')),
        h('button', { class: 'ib', title: 'Close (Esc)', onclick: deselect }, icon('x')),
      ),
      h('div', { class: 'crumbs', title: e.sourceHint || '' }, e.components.length ? [h('b', {}, e.components[0]), e.components.slice(1, 4).map((n) => ' ‹ ' + n)] : e.text ? `“${e.text.slice(0, 50)}”` : e.selector),
      h('div', { class: 'scope' },
        h('button', { class: e.scope === 'one' ? 'on' : '', onclick: () => setScope('one') }, 'This element'),
        h('button', { class: e.scope === 'all' ? 'on' : '', disabled: !e.classSelector, title: e.classSelector || 'Element has no classes', onclick: () => setScope('all') }, `All matching (${count})`),
      ),
    );
    dragHandle(head);

    const body = h('div', { class: 'body' }, sectionsFor(el));
    const note = h('textarea', { class: 'note', placeholder: 'Note for the agent (optional) — e.g. “apply to all CTAs”', spellcheck: false });
    note.value = e.note || '';
    note.addEventListener('input', () => { e.note = note.value; if (hasProps(e)) persist(); });
    note.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) send([e]); });
    statusEl = h('div', { class: 'status' });
    footBtns = {
      reset: h('button', { class: 'btn', title: 'Reset all changes on this element', onclick: () => resetProps(Object.keys(e.props)) }, icon('reset')),
      copy: h('button', { class: 'btn', title: 'Copy as a prompt for any agent', onclick: () => copy([e]) }, 'Copy'),
      save: h('button', { class: 'btn', title: 'Keep this preview on reload', onclick: () => save(e) }, 'Save'),
      send: h('button', { class: 'btn primary', title: 'Send to the agent (⌘↵)', onclick: () => send([e]) }, icon('send'), 'Send to agent'),
    };
    const foot = h('div', { class: 'foot' }, note, statusEl, h('div', { class: 'acts' }, footBtns.reset, footBtns.copy, footBtns.save, footBtns.send));
    panel.append(head, body, foot);
    body.scrollTop = scroll;
    // Tab walks parameters only; buttons, toggles and the note stay clickable but out of the order.
    panel.querySelectorAll('button, textarea, input:not([data-param])').forEach((x) => (x.tabIndex = -1));

    if (!panelPos) {
      panel.style.left = innerWidth - 292 - 16 + 'px';
      panel.style.top = '16px';
    } else {
      panel.style.left = clamp(panelPos.x, 0, innerWidth - 120) + 'px';
      panel.style.top = clamp(panelPos.y, 0, innerHeight - 60) + 'px';
    }
    syncAll();
  }

  function syncFoot() {
    const e = S.edit;
    if (!e || !statusEl) return;
    const n = Object.keys(e.props).length;
    let msg = n ? `${n} change${n > 1 ? 's' : ''} · live preview` : 'Drag a value to tune it. Click a value to type.';
    let cls = '';
    if (e.agent === 'pending') (msg = 'Sent · waiting for the agent'), (cls = 'agent');
    else if (e.agent === 'acknowledged') (msg = 'Agent is applying this…'), (cls = 'agent');
    else if (e.agent === 'dismissed') (msg = `Agent declined: ${e.reply || 'no reason given'}`), (cls = 'warn');
    else if (e.agent === 'modified') (msg = 'Edited since sending — send again to update'), (cls = 'warn');
    else if (n && e.saved && !e.dirty) msg = 'Saved · this preview stays on reload';
    statusEl.textContent = msg;
    statusEl.className = 'status ' + cls;
    footBtns.reset.disabled = footBtns.copy.disabled = footBtns.save.disabled = !n;
    footBtns.send.disabled = !n || !S.online || e.agent === 'pending' || e.agent === 'acknowledged';
    footBtns.send.title = S.online ? 'Send to the agent (⌘↵)' : `Caliper server offline (${ENDPOINT}) — use Copy`;
    footBtns.save.textContent = e.saved && !e.dirty ? 'Saved' : 'Save';
  }

  function dragHandle(head) {
    head.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('button')) return;
      const r = panel.getBoundingClientRect();
      const ox = ev.clientX - r.left;
      const oy = ev.clientY - r.top;
      head.setPointerCapture(ev.pointerId);
      const move = (e2) => {
        panelPos = { x: clamp(e2.clientX - ox, 0, innerWidth - 120), y: clamp(e2.clientY - oy, 0, innerHeight - 60) };
        panel.style.left = panelPos.x + 'px';
        panel.style.top = panelPos.y + 'px';
      };
      const up = () => {
        head.removeEventListener('pointermove', move);
        head.removeEventListener('pointerup', up);
        lsSet(UI_KEY, { ...lsGet(UI_KEY, {}), pos: panelPos });
      };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    });
  }

  // Tab / ⇧Tab cycle through the visible parameter controls (skipping collapsed sections) and wrap,
  // instead of wandering into the panel's buttons, the toolbar and the page.
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
    const stops = [...panel.querySelectorAll('[data-param]')].filter((x) => !x.closest('.sec.closed') && x.getClientRects().length);
    if (!stops.length) return;
    e.preventDefault();
    e.stopPropagation();
    const active = shadow.activeElement;
    const i = stops.findIndex((x) => x === active || x.contains(active));
    const next = stops[i < 0 ? (e.shiftKey ? stops.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + stops.length) % stops.length];
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest' });
    if (next.select) next.select();
  }, true);

  function setScope(scope) {
    const e = S.edit;
    if (scope === 'all' && !e.classSelector) return;
    e.scope = scope;
    S.matches = [];
    matchTick = 0;
    applyStyles();
    if (hasProps(e)) touched(e);
    renderPanel();
  }

  // ---------------------------------------------------------------- selection
  function select(el) {
    if (!el || el === host || el === document.documentElement) return;
    S.sel = el;
    S.edit = findEditFor(el) || newEdit(el);
    S.colorOpen = null;
    S.matches = [];
    matchTick = 0;
    renderPanel();
  }
  function deselect() {
    S.sel = null;
    S.edit = null;
    renderPanel();
  }
  function selectRel(dir) {
    if (!S.sel) return;
    const next = dir === 'up' ? S.sel.parentElement : S.sel.firstElementChild;
    if (next && next !== document.documentElement) select(next);
  }

  // ---------------------------------------------------------------- save / copy / send
  function save(e) {
    e.saved = true;
    e.dirty = false;
    persist();
    syncAll();
    renderBar();
    toast('Saved — this preview stays on reload until you send or remove it');
  }

  function payload(e) {
    const count = e.classSelector ? safeAll(e.classSelector).length : 1;
    return {
      id: e.changeId || undefined,
      url: location.origin + e.path,
      origin: location.origin,
      path: e.path,
      title: document.title,
      viewport: { w: innerWidth, h: innerHeight },
      element: {
        tag: e.tag,
        label: e.label,
        selector: e.selector,
        classSelector: e.classSelector,
        classes: e.classes,
        text: e.text,
        openingTag: e.openingTag,
        components: e.components,
        sourceHint: e.sourceHint,
        scope: e.scope,
        matchCount: e.scope === 'all' ? count : 1,
      },
      changes: Object.entries(e.props).map(([property, v]) => ({ property, from: v.from, to: v.to, hint: twHint(property, v.to) })),
      tailwind: suggestTw(e.props),
      css: cssFor(e),
      note: e.note || '',
    };
  }

  async function copy(edits) {
    const text = edits.filter(hasProps).map((e) => formatChange(payload(e))).join('\n\n---\n\n');
    try {
      await navigator.clipboard.writeText(text + '\n\n' + AGENT_GUIDE);
      toast('Copied — paste it to any agent');
    } catch {
      toast('Clipboard blocked by the browser');
    }
  }

  async function send(edits) {
    edits = edits.filter((e) => hasProps(e) && e.agent !== 'pending' && e.agent !== 'acknowledged');
    if (!edits.length) return;
    if (!S.online) return toast(`Caliper server offline — start it with: caliper server`);
    let ok = 0;
    for (const e of edits) {
      try {
        const body = JSON.stringify(payload(e));
        const opts = { headers: { 'content-type': 'application/json' }, body };
        let res = e.changeId ? await fetch(`${ENDPOINT}/changes/${e.changeId}`, { ...opts, method: 'PUT' }) : null;
        if (!res || res.status === 404) res = await fetch(`${ENDPOINT}/changes`, { ...opts, method: 'POST' });
        if (!res.ok) throw new Error(res.status);
        const c = await res.json();
        Object.assign(e, { changeId: c.id, agent: 'pending', reply: null, dirty: false });
        ok++;
      } catch (err) {
        toast('Send failed: ' + err.message);
      }
    }
    persist();
    syncAll();
    renderBar();
    if (S.listOpen) renderList();
    if (ok) toast(ok === 1 ? 'Sent to the agent' : `Sent ${ok} changes to the agent`);
  }

  function removeEdit(e) {
    S.edits = S.edits.filter((x) => x !== e);
    if (e.changeId && (e.agent === 'pending' || e.agent === 'acknowledged' || e.agent === 'modified'))
      fetch(`${ENDPOINT}/changes/${e.changeId}`, { method: 'DELETE' }).catch(() => {});
    if (S.edit === e) S.edit = S.sel ? newEdit(S.sel) : null;
    applyStyles();
    persist();
    renderPanel();
    renderBar();
    if (S.listOpen) renderList();
  }

  // ---------------------------------------------------------------- server link
  let es;
  let backoff = 2000;
  function connect() {
    try {
      es = new EventSource(ENDPOINT + '/events');
    } catch {
      return;
    }
    es.onopen = () => {
      S.online = true;
      backoff = 2000;
      renderBar();
      syncAll();
    };
    es.onerror = () => {
      S.online = false;
      es.close();
      renderBar();
      syncAll();
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 60000);
    };
    es.addEventListener('snapshot', (ev) => {
      const byId = new Map(JSON.parse(ev.data).map((c) => [c.id, c]));
      for (const e of [...S.edits]) {
        if (!e.changeId) continue;
        const c = byId.get(e.changeId);
        if (c) onStatus(c);
        else if (e.agent !== 'modified') Object.assign(e, { changeId: null, agent: null });
      }
      persist();
      renderBar();
    });
    es.addEventListener('change', (ev) => onStatus(JSON.parse(ev.data)));
  }
  function onStatus(c) {
    const e = S.edits.find((x) => x.changeId === c.id);
    if (!e) return;
    if (c.status === 'resolved') {
      // The agent put it in source; give HMR a beat, then drop the override.
      setTimeout(() => {
        if (!S.edits.includes(e)) return;
        removeEdit(e);
        toast(`✓ Applied in code: ${e.label}${c.reply ? ' — ' + c.reply : ''}`, 3500);
      }, 900);
      return;
    }
    if (c.status === 'deleted') Object.assign(e, { changeId: null, agent: null });
    else if (e.agent !== 'modified') Object.assign(e, { agent: c.status, reply: c.reply });
    persist();
    syncAll();
    renderBar();
    if (S.listOpen) renderList();
  }

  // ---------------------------------------------------------------- toolbar + list
  function renderBar() {
    const here = S.edits.filter(hasProps);
    const unsent = here.filter((e) => !e.agent || e.agent === 'modified' || e.agent === 'dismissed');
    bar.innerHTML = '';
    bar.classList.toggle('collapsed', S.barCollapsed);
    if (S.barCollapsed) {
      bar.append(
        h('button', { class: 'bb' + (S.inspecting ? ' on' : ''), title: 'Expand Caliper (drag to move · ⌥C inspects)', onclick: () => setCollapsed(false) },
          icon('target'), here.length ? h('span', { class: 'badge' }, here.length) : '', h('span', { class: 'net' + (S.online ? ' ok' : ''), style: 'margin:0 0 0 2px' })),
      );
      placeBar();
      syncFoot();
      return;
    }
    bar.append(
      h('span', { class: 'grip', title: 'Drag to move', html: ICON.grip }),
      h('button', { class: 'bb' + (S.inspecting ? ' on' : ''), title: 'Inspect (⌥C)', onclick: () => setInspect(!S.inspecting) }, icon('target'), 'Inspect', h('span', { class: 'kbd' }, '⌥C')),
      h('div', { class: 'sep' }),
      h('button', { class: 'bb' + (S.listOpen ? ' on' : ''), title: 'All changes', onclick: () => { S.listOpen = !S.listOpen; renderList(); renderBar(); } }, icon('list'), h('span', { class: 'count' }, here.length)),
      h('button', { class: 'bb', title: S.show ? 'Showing your changes — click to see the original' : 'Showing the original — click to see your changes', onclick: () => { S.show = !S.show; applyStyles(); renderBar(); } }, icon(S.show ? 'eye' : 'eyeOff')),
      h('button', { class: 'bb primary', disabled: !unsent.length || !S.online, title: S.online ? 'Send every unsent change to the agent' : 'Caliper server offline', onclick: () => send(unsent) }, icon('send'), unsent.length ? `Send ${unsent.length}` : 'Send'),
      h('span', { class: 'net' + (S.online ? ' ok' : ''), title: S.online ? `Connected to ${ENDPOINT}` : `Offline — run "caliper server" (${ENDPOINT})` }),
      h('button', { class: 'ib', title: 'Collapse', onclick: () => setCollapsed(true) }, icon('collapse')),
    );
    placeBar();
    syncFoot();
  }

  function setCollapsed(on) {
    S.barCollapsed = on;
    if (on) S.listOpen = false;
    lsSet(UI_KEY, { ...lsGet(UI_KEY, {}), barCollapsed: on });
    renderList();
    renderBar();
  }

  // Toolbar position: null = bottom centre; otherwise its top-left, kept inside the viewport.
  // Collapsing/expanding keeps the bar's anchor edge, so the button you clicked stays put.
  let barPos = lsGet(UI_KEY, {}).barPos || null;
  function placeBar() {
    const w = bar.offsetWidth;
    const hgt = bar.offsetHeight;
    let x;
    let y;
    if (!barPos) {
      x = (innerWidth - w) / 2;
      y = innerHeight - hgt - 16;
    } else {
      x = barPos.anchor === 'right' ? barPos.x - w : barPos.x;
      y = barPos.y;
    }
    bar.style.left = clamp(x, 8, Math.max(8, innerWidth - w - 8)) + 'px';
    bar.style.top = clamp(y, 8, Math.max(8, innerHeight - hgt - 8)) + 'px';
    placeList();
  }
  function placeList() {
    if (list.hidden) return;
    const r = bar.getBoundingClientRect();
    const w = 340;
    list.style.left = clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8) + 'px';
    if (r.top > innerHeight / 2) {
      list.style.top = '';
      list.style.bottom = innerHeight - r.top + 8 + 'px';
    } else {
      list.style.bottom = '';
      list.style.top = r.bottom + 8 + 'px';
    }
  }

  // Drag from anywhere on the bar (buttons included); past a few px it's a move, not a click.
  bar.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const r = bar.getBoundingClientRect();
    const ox = ev.clientX - r.left;
    const oy = ev.clientY - r.top;
    const sx = ev.clientX;
    const sy = ev.clientY;
    let dragging = false;
    const move = (e2) => {
      if (!dragging) {
        if (Math.hypot(e2.clientX - sx, e2.clientY - sy) < 4) return;
        dragging = true;
        bar.setPointerCapture(ev.pointerId);
        bar.classList.add('dragging');
      }
      const w = bar.offsetWidth;
      const x = clamp(e2.clientX - ox, 8, innerWidth - w - 8);
      const y = clamp(e2.clientY - oy, 8, innerHeight - bar.offsetHeight - 8);
      // Anchor to the nearer side so collapse/expand grows away from the screen edge.
      barPos = x + w / 2 > innerWidth / 2 ? { anchor: 'right', x: x + w, y } : { anchor: 'left', x, y };
      placeBar();
    };
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      if (!dragging) return;
      bar.classList.remove('dragging');
      lsSet(UI_KEY, { ...lsGet(UI_KEY, {}), barPos });
      // Swallow the click that ends a drag.
      const swallow = (c) => { c.stopPropagation(); c.preventDefault(); };
      bar.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => bar.removeEventListener('click', swallow, { capture: true }), 0);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  });
  bar.addEventListener('dblclick', (ev) => {
    // Double-click the grip: back to the default spot.
    if (!ev.target.closest('.grip')) return;
    barPos = null;
    lsSet(UI_KEY, { ...lsGet(UI_KEY, {}), barPos });
    placeBar();
  });
  window.addEventListener('resize', () => placeBar());

  function pill(e) {
    if (e.agent === 'pending') return h('span', { class: 'pill blue' }, 'sent');
    if (e.agent === 'acknowledged') return h('span', { class: 'pill blue' }, 'agent working');
    if (e.agent === 'dismissed') return h('span', { class: 'pill amber', title: e.reply || '' }, 'declined');
    if (e.agent === 'modified') return h('span', { class: 'pill amber' }, 'edited');
    if (e.saved) return h('span', { class: 'pill green' }, 'saved');
    return h('span', { class: 'pill' }, 'draft');
  }

  function renderList() {
    list.hidden = !S.listOpen;
    if (!S.listOpen) return;
    requestAnimationFrame(placeList);
    const all = S.edits.filter(hasProps);
    list.innerHTML = '';
    list.append(
      h('div', { class: 'lh' }, `Changes (${all.length})`, h('span', { style: 'display:flex;gap:4px' },
        h('button', { class: 'btn', disabled: !all.length, onclick: () => copy(all) }, 'Copy all'),
        h('button', { class: 'ib', title: 'Close', onclick: () => { S.listOpen = false; renderList(); renderBar(); } }, icon('x')))),
      all.length
        ? h('div', { class: 'items' }, all.map((e) => {
            const n = Object.keys(e.props).length;
            const chk = h('input', { type: 'checkbox', class: 'chk', checked: e.enabled, title: 'Preview on/off' });
            chk.addEventListener('change', () => { e.enabled = chk.checked; applyStyles(); persist(); renderList(); });
            return h('div', { class: 'item' + (e.enabled ? '' : ' off') },
              chk,
              h('div', { class: 'main', onclick: () => jumpTo(e) },
                h('div', { class: 'nm' }, e.label),
                h('div', { class: 'sub' }, `${n} prop${n > 1 ? 's' : ''} · ${Object.keys(e.props).slice(0, 3).join(', ')}${n > 3 ? '…' : ''}${e.scope === 'all' ? ' · all matching' : ''}${activeHere(e) ? '' : ' · ' + e.path}`)),
              pill(e),
              h('button', { class: 'ib', title: 'Remove (drop the preview)', onclick: () => removeEdit(e) }, icon('trash')));
          }))
        : h('div', { class: 'empty' }, 'No changes yet.', h('br'), 'Turn on Inspect (⌥C), click an element and drag a value.'),
    );
  }

  function jumpTo(e) {
    if (!activeHere(e)) return toast(`That change is on ${e.path}`);
    const el = safeAll(editSelector(e))[0];
    if (!el) return toast('Element not found on this page');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    S.sel = el;
    S.edit = e;
    S.colorOpen = null;
    renderPanel();
  }

  // ---------------------------------------------------------------- input
  function setInspect(on) {
    S.inspecting = on;
    S.hover = null;
    document.documentElement.style.cursor = on ? 'crosshair' : '';
    renderBar();
  }

  const block = (e) => {
    if (!S.inspecting || isOurs(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick', 'contextmenu', 'touchstart', 'auxclick'])
    window.addEventListener(t, block, { capture: true, passive: false });
  window.addEventListener('click', (e) => {
    if (!S.inspecting || isOurs(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    select(e.target.nodeType === 1 ? e.target : e.target.parentElement);
  }, true);
  window.addEventListener('pointermove', (e) => {
    if (!S.inspecting) return;
    S.hover = isOurs(e) ? null : e.target;
  }, true);
  document.addEventListener('mouseleave', () => (S.hover = null));

  window.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.composedPath()[0] || {}).tagName) || (e.composedPath()[0] || {}).isContentEditable;
    if (e.altKey && e.code === 'KeyC' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      setInspect(!S.inspecting);
      return;
    }
    if (typing) return;
    if (e.key === 'Escape') {
      if (S.colorOpen) (S.colorOpen = null), renderPanel();
      else if (S.listOpen) (S.listOpen = false), renderList(), renderBar();
      else if (S.sel) deselect();
      else if (S.inspecting) setInspect(false);
      else return;
      e.preventDefault();
    } else if (e.altKey && S.sel && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      selectRel(e.key === 'ArrowUp' ? 'up' : 'down');
    }
  }, true);

  // SPA navigation: re-scope overrides when the path changes.
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    applyStyles();
    if (S.sel && !S.sel.isConnected) deselect();
    renderBar();
  }, 400);

  // ---------------------------------------------------------------- boot
  function boot() {
    document.documentElement.append(host);
    restore();
    applyStyles();
    try {
      scanTokens();
    } catch {}
    renderBar();
    connect();
    window.__caliper = {
      version: '0.1.0',
      endpoint: ENDPOINT,
      state: S,
      inspect: setInspect,
      select,
      rescanTokens: () => { Object.assign(T, { colors: [], colorByHex: new Map(), text: new Map(), radius: new Map(), weight: new Map(), leading: new Map(), tracking: new Map(), spacingPx: null }); scanTokens(); },
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  // Tokens from stylesheets that load late (Tailwind browser build, CSS-in-JS).
  window.addEventListener('load', () => setTimeout(() => window.__caliper && window.__caliper.rescanTokens(), 300));
})();
