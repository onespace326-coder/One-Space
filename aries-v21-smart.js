/* Aries V21 smart scan engine
 * - Understands real-world deadlines ("by 5 pm Friday", "12 Nov", "in 3 days", "EOM", "kal")
 * - Separates tasks for YOU from things the sender will do, and skips automated noise
 * - Scores confidence, merges duplicates with existing tasks, scans each message only once
 * Loaded before aries-intelligence.js, which uses window.AriesSmart. Runs fully in the browser.
 */
(() => {
  'use strict';
  if (window.AriesSmart) return;

  const pad = n => String(n).padStart(2, '0');
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const MONTHS = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const DAY_SHORT = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
  const MON_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const DAY_RE = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thur?s?|fri|sat)';
  const ANCHOR = '(?:by|before|until|till|on or before|no later than|latest by|due(?:\\s+(?:on|by|date))?|deadline(?:\\s+is|\\s*:)?|last date(?:\\s+is|\\s+to\\s+\\w+)?|submit by|due)';

  const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const weekdayIndex = name => { const n = String(name).toLowerCase(); return DAYS.includes(n) ? DAYS.indexOf(n) : DAY_SHORT[n.slice(0, 4)] ?? DAY_SHORT[n.slice(0, 3)]; };
  const nextWeekday = (from, idx, forceNext) => { let delta = (idx - from.getDay() + 7) % 7; if (delta === 0 && forceNext) delta = 7; return addDays(from, delta); };

  function parseTime(text) {
    const t = String(text || '');
    let m = t.match(/\b(?:at|by|before|@|till|until|around)?\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
    if (m) { let h = Number(m[1]) % 12; if (/p/i.test(m[3])) h += 12; return { h, m: Number(m[2] || 0) }; }
    m = t.match(/\b(?:at|by|before|@|till|until)\s*([01]?\d|2[0-3]):([0-5]\d)\b/i);
    if (m) return { h: Number(m[1]), m: Number(m[2]) };
    if (/\bnoon\b/i.test(t)) return { h: 12, m: 0 };
    if (/\b(?:eod|end of (?:the )?day|cob|close of business)\b/i.test(t)) return { h: 18, m: 0 };
    if (/\bmorning\b/i.test(t)) return { h: 10, m: 0 };
    if (/\bafternoon\b/i.test(t)) return { h: 15, m: 0 };
    if (/\b(?:tonight|evening)\b/i.test(t)) return { h: 20, m: 0 };
    return null;
  }

  /** Returns { at:ISO|null, label, hasTime, vague, confidence } */
  function parseDeadline(text, nowDate) {
    const now = nowDate ? new Date(nowDate) : new Date();
    const raw = String(text || '');
    const lower = raw.toLowerCase();
    const today = startOfDay(now);
    const time = parseTime(raw);
    let date = null, vague = false, confidence = 0.9, anchored = new RegExp(ANCHOR, 'i').test(raw);

    const finish = () => {
      if (!date) return { at: null, label: 'No date detected', hasTime: false, vague: false, confidence: 0 };
      const d = new Date(date);
      const hasTime = !!time && !vague;
      d.setHours(time ? time.h : 18, time ? time.m : 0, 0, 0);
      const isToday = keyOf(d) === keyOf(now), isTomorrow = keyOf(d) === keyOf(addDays(now, 1));
      const dayLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      const timeLabel = hasTime ? ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
      return { at: d.toISOString(), label: dayLabel + timeLabel, hasTime, vague, confidence: anchored ? Math.min(1, confidence + 0.08) : confidence };
    };

    // 1) ISO and numeric dates (DMY first: this workspace is used in India)
    let m = lower.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (m) { date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); return finish(); }
    m = lower.match(/\b(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?\b/);
    if (m && !/\d{1,2}:\d{2}/.test(m[0])) {
      let a = Number(m[1]), b = Number(m[2]), y = m[3] ? Number(m[3]) : now.getFullYear(); if (y < 100) y += 2000;
      let day = a, mon = b; if (mon > 12 && day <= 12) { day = b; mon = a; }
      if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
        date = new Date(y, mon - 1, day);
        if (!m[3] && date < addDays(today, -45)) date.setFullYear(y + 1);
        confidence = 0.82; return finish();
      }
    }
    // 2) "12th November 2026", "12 Nov", "Nov 12", "November 12th, 2026"
    const dm = lower.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${MON_RE}\\b(?:[,\\s]+(20\\d{2}))?`));
    const md = lower.match(new RegExp(`\\b${MON_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:[,\\s]+(20\\d{2}))?`));
    const hit = dm ? { day: Number(dm[1]), mon: MONTHS[dm[2]], y: dm[3] } : md ? { day: Number(md[2]), mon: MONTHS[md[1]], y: md[3] } : null;
    if (hit && hit.day >= 1 && hit.day <= 31 && hit.mon !== undefined) {
      let y = hit.y ? Number(hit.y) : now.getFullYear();
      date = new Date(y, hit.mon, hit.day);
      if (!hit.y && date < addDays(today, -45)) date.setFullYear(y + 1);
      return finish();
    }
    // 3) relative: in N days / weeks / hours
    m = lower.match(/\bin\s+(\d{1,2}|a|an|one|two|three|four|five|six|seven)\s+(hour|hr|day|week)s?\b/);
    if (m) {
      const words = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
      const n = words[m[1]] ?? Number(m[1]);
      if (m[2].startsWith('h')) { const d = new Date(now.getTime() + n * 3600e3); date = startOfDay(d); const out = finish(); const real = new Date(now.getTime() + n * 3600e3); return { ...out, at: real.toISOString(), hasTime: true, label: (keyOf(real) === keyOf(now) ? 'Today' : 'Tomorrow') + ' · ' + real.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) }; }
      date = addDays(today, m[2] === 'week' ? n * 7 : n); confidence = 0.8; return finish();
    }
    // 4) today / tomorrow / day after (English + common Hinglish)
    if (/\b(today|tonight|aaj|eod|end of (?:the )?day|cob|close of business|asap|immediately|right away)\b/.test(lower)) { date = today; confidence = /asap|immediately|right away/.test(lower) ? 0.7 : 0.9; return finish(); }
    if (/\b(day after tomorrow|parso|parson)\b/.test(lower)) { date = addDays(today, 2); return finish(); }
    if (/\b(tomorrow|tmrw|tmr|kal)\b/.test(lower)) { date = addDays(today, 1); return finish(); }
    // 5) weekdays: "by Friday", "next Monday", "this Thursday"
    m = lower.match(new RegExp(`\\b(next|this|coming|upcoming)?\\s*${DAY_RE}\\b`));
    if (m && (m[1] || anchored || /\b(on|by|before|until|every|this|next)\s+\S*\s*$/.test(lower.slice(0, m.index + m[0].length)) || /\b(on|by|before|until)\b/.test(lower))) {
      const idx = weekdayIndex(m[2]);
      if (idx !== undefined) { date = nextWeekday(today, idx, m[1] === 'next'); if (m[1] === 'next' && date - today < 3 * 86400e3 && now.getDay() !== 0) date = addDays(date, 0); return finish(); }
    }
    // 6) periods
    if (/\b(end of (?:the )?month|month[- ]end|eom)\b/.test(lower)) { date = new Date(now.getFullYear(), now.getMonth() + 1, 0); return finish(); }
    if (/\b(end of (?:the )?week|eow|this week|by the weekend)\b/.test(lower)) { date = nextWeekday(today, 5, false); vague = true; confidence = 0.6; return finish(); }
    if (/\bnext week\b/.test(lower)) { date = nextWeekday(addDays(today, 7 - ((today.getDay() + 6) % 7)), 5, false); vague = true; confidence = 0.55; return finish(); }
    if (/\bnext month\b/.test(lower)) { date = new Date(now.getFullYear(), now.getMonth() + 1, 1); vague = true; confidence = 0.45; return finish(); }
    return finish();
  }

  // ---------- noise / structure helpers ----------
  const NOISE_SENDER = /\b(no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|noreply|mailer-daemon|notifications?@|newsletter|marketing|promo(?:tions?)?|deals?@|offers?@|updates?@)\b/i;
  const NOISE_TEXT = /\b(unsubscribe|view in browser|manage (?:your )?preferences|privacy policy|terms of service|promotional|% off|flat \d+%|sale ends|limited time offer|one[- ]time password|your otp|verification code|security code|no action (?:is )?required|this is an automated)\b/i;
  const OTHER_PERSON = /^\s*(?:i|we)(?:'ll|\s+will|\s+shall|\s+have|\s+had|\s+am|\s+are|\s+can|\s+would)\b|^\s*(?:thanks?|thank you|regards|best|cheers|sincerely|hi|hello|dear)\b/i;
  const ACTION_VERBS = 'send|share|submit|prepare|review|complete|finish|call|contact|schedule|book|pay|upload|update|sign|confirm|reply|respond|deliver|check|approve|arrange|follow\\s+up|provide|forward|return|file|renew|cancel|attach|circulate|analy[sz]e|attend|join|register|download|fill|finali[sz]e|revert|clear|settle|verify|collect|resubmit|rsvp|accept|complete|draft|read|sign\\s+off|get back';
  const ACTIONS = new RegExp(`\\b(${ACTION_VERBS})\\b`, 'i');
  const IMPERATIVE = new RegExp(`^\\s*(?:(?:please|kindly|also|and|then|do|just)\\s+)*(${ACTION_VERBS})\\b`, 'i');
  const REQUEST = /\b(please|kindly|pls|plz|could you|would you|can you|will you|need you to|you need to|you(?:'ll| will) need to|you must|you should|you are required to|you're required to|action required|action needed|request(?:ed)? to|make sure (?:to|that you)|don't forget to|do not forget to|reminder(?:\s*:|\s+to)|pending (?:from|with) you|awaiting your|waiting for your|your (?:approval|confirmation|response|reply|signature|input|feedback) (?:is )?(?:needed|required|requested|pending)|kripya|bhej do|bhejna|karna hai|kar dena|jaldi)\b/i;
  const DEADLINE_WORDS = /\b(deadline|due|last date|expires?|expiry|by\s+\w+day|before\s+\w+day|asap|urgent|today|tomorrow|eod|cob|eom|this week|next week)\b/i;
  const BILLING = /\b(invoice|bill|payment|premium|emi|fee|fees|renewal|subscription|rent|tax|gst|itr|challan)\b[^.!?\n]{0,80}\b(due|payable|overdue|expires?|expiring|pending|before|by)\b|\b(due|payable|overdue|expires?|expiring)\b[^.!?\n]{0,60}\b(invoice|bill|payment|premium|emi|fee|fees|rent|tax|gst|itr)\b/i;
  const URGENT = /\b(urgent|asap|immediately|critical|high priority|top priority|time[- ]sensitive|at the earliest|right away|jaldi|zaroori)\b/i;
  const LOW = /\b(fyi|for your information|no rush|whenever you (?:can|get a chance)|when you have time|low priority|optional)\b/i;

  function plainFromHtml(html) {
    if (!html) return '';
    try {
      const doc = new DOMParser().parseFromString(String(html), 'text/html');   // inert: no scripts, no image loads
      doc.querySelectorAll('script,style,head,noscript,blockquote[type=cite]').forEach(n => n.remove());
      doc.querySelectorAll('br,p,div,li,tr,h1,h2,h3,h4').forEach(n => n.append('\n'));
      return (doc.body?.textContent || '').replace(/[ \t\u00a0]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    } catch (_) { return String(html).replace(/<[^>]+>/g, ' '); }
  }
  function dropQuotedReplies(text) {
    const cut = String(text).search(/\n\s*(?:on .{8,80} wrote:|-{2,}\s*original message\s*-{2,}|from:\s.+\n\s*sent:|>{1,}\s)/i);
    return cut > 60 ? String(text).slice(0, cut) : String(text);
  }
  function splitUnits(text) {
    return String(text).replace(/\r/g, '').split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9"'(])|(?<=;)\s+/)
      .map(x => x.replace(/^[\s>*•\-–\d.)]+/, '').trim()).filter(x => x.length >= 14 && x.length <= 320);
  }
  const STOP = new Set('the a an to of and or for in on at by with from your you please kindly this that is are be will can could would it as we i my our me us do not no have has had was were been if but so then also just'.split(' '));
  const tokens = s => String(s || '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)).map(w => w.replace(/(ing|ed|es|s)$/, ''));
  function similarity(a, b) {
    const A = new Set(tokens(a)), B = new Set(tokens(b)); if (!A.size || !B.size) return 0;
    let inter = 0; A.forEach(w => { if (B.has(w)) inter++; });
    return inter / Math.min(A.size, B.size) * 0.5 + inter / (A.size + B.size - inter) * 0.5;
  }
  function tidyTitle(sentence) {
    let t = String(sentence).replace(/^(?:hi|hello|dear)\b[^,.:]{0,30}[,:]\s*/i, '')
      .replace(/^(?:(?:also|and|then|just|so)\s+)+/i, '')
      .replace(/^(?:please|kindly|pls|plz)\s+/i, '')
      .replace(/^(?:could|would|can|will)\s+you\s+(?:please\s+)?/i, '')
      .replace(/^(?:i|we)\s+(?:need|want|would like)\s+you\s+to\s+/i, '')
      .replace(/^(?:you\s+(?:need|have|are required|are requested|will need|must|should)\s+to\s+)/i, '')
      .replace(/^(?:action required|action needed|reminder)\s*[:\-–]\s*/i, '')
      .replace(/\s+(?:please|thanks|thank you|pls)[.!?]*$/i, '')
      .replace(/[.!?]+$/, '').replace(/\s+/g, ' ').trim();
    if (t.length > 110) { const cut = t.slice(0, 110); t = cut.slice(0, Math.max(60, cut.lastIndexOf(' '))).replace(/[,;:\-–]+$/, '') + '…'; }
    return t ? t[0].toUpperCase() + t.slice(1) : '';
  }

  /** Extract actionable items for the owner from one mail message. */
  function extract(message, opts = {}) {
    const m = message || {};
    const header = [m.name, m.email].filter(Boolean).join(' ');
    const automated = NOISE_SENDER.test(header) || !!(m.listUnsubscribe || m.list_unsubscribe);
    const subject = String(m.subject || '').trim();
    const bodyText = dropQuotedReplies([m.body, plainFromHtml(m.bodyHtml || m.body_html)].filter(Boolean).join('\n') || '');
    const snippet = String(m.snippet || '');
    const full = [subject, snippet, bodyText].join('\n');
    if (!full.trim()) return [];
    if (NOISE_TEXT.test(subject) || (automated && !REQUEST.test(full) && !BILLING.test(full))) return [];
    const important = !!(m.important || m.is_important);
    const found = [], seenTitle = new Set();
    let billingCovered = false;
    const units = [];
    if (subject) units.push({ text: subject, fromSubject: true });
    splitUnits(snippet).slice(0, 4).forEach(t => units.push({ text: t }));
    splitUnits(bodyText).slice(0, 60).forEach(t => units.push({ text: t }));

    // Context deadline: a date mentioned in the subject usually governs the whole mail.
    const subjectDeadline = subject ? parseDeadline(subject) : { at: null };
    for (const u of units) {
      const s = u.text.replace(/^(?:hi|hello|dear|hey)\b[^,.:]{0,30}[,:]\s*/i, '');
      if (s.length < 12) continue;
      if (OTHER_PERSON.test(s) && !REQUEST.test(s)) continue;
      if (!u.fromSubject && billingCovered && BILLING.test(s)) continue;     // the subject already captured this payment
      if (/\?\s*$/.test(s) && !/\b(can|could|would|will) you\b/i.test(s)) continue;      // plain questions are not tasks
      const requested = REQUEST.test(s), action = ACTIONS.test(s), imperative = IMPERATIVE.test(s);
      const billing = BILLING.test(s);
      const secondPerson = /\b(you|your|yours|aap|aapka|tum|tumhara)\b/i.test(s);
      const dl = parseDeadline(s);
      const hasDeadline = !!dl.at || DEADLINE_WORDS.test(s);
      const qualifies = (requested && action) || (imperative && (hasDeadline || requested || important)) || billing || (u.fromSubject && action && hasDeadline && /\b(due|deadline|by|before|reminder|action)\b/i.test(s));
      if (!qualifies) continue;
      let title = tidyTitle(s);
      if (title && dl.at) { const tail = title.match(/\s+(?:by|before|until|due(?:\s+on|\s+by)?)\s+(.{3,40})$/i); if (tail && parseDeadline(tail[0]).at) { const trimmed = title.slice(0, tail.index).replace(/[,;:\-–]+$/, '').trim(); if (trimmed.length >= 8) title = trimmed; } }
      if (!title || title.length < 8) continue;
      if (billing && !action) {
        const bare = title.replace(/\s*[-–:,]?\s*(?:is\s+)?(?:due|payable|overdue|expires?|expiring)\b.*$/i, '').trim();
        title = 'Settle: ' + (bare.length > 5 ? bare : title);
      }
      if (billing && u.fromSubject) billingCovered = true;
      const norm = title.toLowerCase(); if (seenTitle.has(norm)) continue; seenTitle.add(norm);
      let due = dl.at ? dl : (subjectDeadline.at ? subjectDeadline : dl);
      // confidence model
      let c = 0.4;
      if (requested) c += 0.16; if (action) c += 0.08; if (imperative) c += 0.1;
      if (secondPerson) c += 0.08; if (dl.at) c += 0.14; else if (subjectDeadline.at) c += 0.07; else if (hasDeadline) c += 0.04;
      if (billing) c += 0.12; if (important) c += 0.05; if (u.fromSubject) c += 0.03;
      if (automated) c -= 0.3; if (/\b(if|when|unless|maybe|might|could be|in case)\b/i.test(s) && !requested) c -= 0.1;
      if (/\b(we|i)\b.{0,20}\b(will|shall|'ll)\b/i.test(s) && !secondPerson) c -= 0.2;
      c = Math.max(0, Math.min(0.98, c));
      let priority = URGENT.test(s) || URGENT.test(subject) ? 'urgent' : LOW.test(s) ? 'low' : 'normal';
      if (priority === 'normal' && due.at) {
        const hrs = (new Date(due.at) - Date.now()) / 3600e3;
        if (hrs < 30) priority = 'high'; else if (hrs < 72 && (important || billing)) priority = 'high';
      }
      if (priority === 'normal' && important) priority = 'high';
      found.push({ title, due, priority, evidence: s.slice(0, 280), confidence: Number(c.toFixed(2)), assignedToUser: !OTHER_PERSON.test(s) && (secondPerson || imperative || requested || billing), kind: billing ? 'payment' : 'action' });
      if (found.length >= 5) break;
    }
    const rank = x => x.confidence + (x.kind === 'payment' ? 0.2 : 0);
    const ranked = found.sort((a, b) => rank(b) - rank(a)), kept = [];
    for (const f of ranked) {
      const sameDay = k => k.due.at && f.due.at && k.due.at.slice(0, 10) === f.due.at.slice(0, 10);
      const dupe = kept.some(k => similarity(k.title, f.title) >= 0.55 || (k.kind === 'payment' && sameDay(k) && (f.kind === 'payment' || /\b(pay|paid|payment|fees?|late|invoice|bill|dues?)\b/i.test(f.title))));
      if (!dupe) kept.push(f);
    }
    return kept.sort((a, b) => b.confidence - a.confidence).slice(0, 4);
  }

  /** Is this candidate already covered by an open task or an earlier suggestion? */
  function isDuplicate(candidate, existingTasks, suggestions, mailId) {
    const title = candidate.title;
    for (const t of existingTasks || []) {
      if (!t || t.done) { continue; }
      if (mailId && t.sourceMailId && String(t.sourceMailId) === String(mailId) && similarity(title, t.title) > 0.45) return true;
      if (similarity(title, t.title) >= 0.72) return true;
    }
    for (const s of suggestions || []) {
      if (!s || s.status === 'dismissed') continue;
      if (similarity(title, s.title) >= 0.8 && (!mailId || String(s.sourceId) === String(mailId) || similarity(title, s.title) >= 0.9)) return true;
    }
    return false;
  }

  const STATS_KEY = 'onespaceAriesScanStatsV21';
  const stats = (() => { try { return { scans: 0, checked: 0, added: 0, lastScanAt: 0, lastAddedAt: 0, ...(JSON.parse(localStorage.getItem(STATS_KEY)) || {}) }; } catch (_) { return { scans: 0, checked: 0, added: 0, lastScanAt: 0, lastAddedAt: 0 }; } })();
  const saveStats = () => { try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (_) {} };

  window.AriesSmart = { parseDeadline, extract, isDuplicate, similarity, plainFromHtml, stats, saveStats, keyOf };
})();
