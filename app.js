  const app = document.getElementById('app');
  const form = document.getElementById('askForm');
  const input = document.getElementById('askInput');
  const threadInner = document.getElementById('threadInner');
  const thread = document.getElementById('thread');
  const hero = document.getElementById('hero');
  const classview = document.getElementById('classview');
  const dock = document.getElementById('dock');
  const examples = document.getElementById('examples');
  const historyList = document.getElementById('historyList');
  const navCheck = document.getElementById('navCheck');
  const navClass = document.getElementById('navClass');

  const MODELS = [
    { name: 'Claude', dot: 'claude' },
    { name: 'ChatGPT', dot: 'chatgpt' },
    { name: 'Gemini', dot: 'gemini' },
  ];

  let mode = 'ask'; // 'ask' | 'paste'
  let deepOn = false;
  const deepBtn = document.getElementById('deepBtn');
  deepBtn.addEventListener('click', () => {
    deepOn = !deepOn;
    deepBtn.classList.toggle('on', deepOn);
  });

  /* ---------- Demo data for the three example questions ---------- */
  const DEMOS = {
    'what causes the seasons?': {
      score: 96, word: 'High agreement',
      bottom: 'The seasons are caused by the tilt of Earth’s axis (about 23.4°) — not by Earth’s distance from the Sun.',
      answers: [
        { model: 0, html: 'Seasons happen because <mark class="agree">Earth’s axis is tilted about 23.4 degrees</mark>. As Earth orbits the Sun, each hemisphere leans toward the Sun for part of the year (summer) and away for another part (winter).', badges: [['true','Axial tilt: true']] },
        { model: 1, html: 'The main cause is <mark class="agree">the tilt of Earth’s rotational axis</mark>, which changes how directly sunlight strikes each hemisphere through the year. Distance from the Sun plays almost no role.', badges: [['true','Axial tilt: true']] },
        { model: 2, html: '<mark class="agree">Earth’s axial tilt</mark> causes the seasons. A common misconception is that summer occurs when Earth is closest to the Sun — in fact, Earth is <em>farthest</em> from the Sun during Northern Hemisphere summer.', badges: [['true','Axial tilt: true'], ['true','Distance misconception: addressed']] },
      ],
      sources: [
        ['NASA — What Causes the Seasons?', 'https://spaceplace.nasa.gov/seasons/en/'],
        ['Britannica — Season', 'https://www.britannica.com/science/season'],
      ],
      delta: 2,
      crosscheck: 'Each model reviewed the other two answers. <b>No corrections needed</b> — all three re-confirmed axial tilt, and Gemini’s note about the distance misconception was verified by Claude and ChatGPT. Re-verified answers are stronger evidence, so the agreement score rises.',
    },
    'is a tomato a fruit or a vegetable?': {
      score: 78, word: 'Mostly agree',
      bottom: 'Botanically, a tomato is a fruit. In cooking — and in U.S. law since 1893 — it is treated as a vegetable. Both are correct depending on context.',
      answers: [
        { model: 0, html: '<mark class="agree">Botanically, a tomato is a fruit</mark> — it develops from a flower and contains seeds. In everyday cooking it’s treated as a vegetable because of its savory use.', badges: [['true','Botanical fruit: true']] },
        { model: 1, html: 'It’s both: <mark class="agree">a fruit by botanical definition</mark>, and a vegetable in the culinary sense. <mark class="conflict">The U.S. Supreme Court ruled it a vegetable in 1893</mark> (Nix v. Hedden) for tariff purposes.', badges: [['true','Botanical fruit: true'], ['disputed','Legal status: context-dependent']] },
        { model: 2, html: '<mark class="agree">A fruit, botanically speaking</mark>. Nutritionists and chefs classify it as a vegetable. <mark class="conflict">Legally it is a vegetable in the United States</mark> — though that ruling only applied to import tariffs, not science.', badges: [['true','Botanical fruit: true'], ['disputed','Legal status: context-dependent']] },
      ],
      sources: [
        ['Britannica — Is a Tomato a Fruit or a Vegetable?', 'https://www.britannica.com/story/is-a-tomato-a-fruit-or-a-vegetable'],
        ['Oyez — Nix v. Hedden (1893)', 'https://www.oyez.org/cases/1850-1900/149us304'],
      ],
      delta: 7,
      crosscheck: 'Each model reviewed the other two answers. <b>Conflict resolved</b> — all three accepted Gemini’s clarification that the 1893 ruling applied only to tariffs, not science. With that context agreed, the answers align more closely and the score rises.',
    },
    'who invented the telephone?': {
      score: 64, word: 'Conflicting',
      bottom: 'Alexander Graham Bell received the first telephone patent in 1876, but Antonio Meucci and Elisha Gray have competing claims — “who invented it” depends on whether you mean the patent, the first working device, or the first idea.',
      answers: [
        { model: 0, html: '<mark class="agree">Alexander Graham Bell patented the telephone in 1876</mark> and is traditionally credited as its inventor. <mark class="conflict">Elisha Gray filed a similar patent claim the very same day</mark>, which remains historically contested.', badges: [['true','Bell patent 1876: true'], ['disputed','Sole inventor: disputed']] },
        { model: 1, html: 'Bell is credited with the invention, holding <mark class="agree">the first U.S. patent for the telephone (1876)</mark>. However, <mark class="conflict">Antonio Meucci demonstrated a voice-communication device years earlier</mark>, and in 2002 the U.S. House recognized his contribution.', badges: [['true','Bell patent 1876: true'], ['unverifiable','Meucci priority: unverifiable']] },
        { model: 2, html: '<mark class="agree">Alexander Graham Bell</mark> is the standard answer. <mark class="conflict">Some historians argue Meucci or Gray deserve the credit</mark> — the truthful answer depends on how “invented” is defined.', badges: [['true','Bell patent 1876: true'], ['disputed','Credit: definition-dependent']] },
      ],
      sources: [
        ['Library of Congress — Telephone Patent', 'https://www.loc.gov/collections/alexander-graham-bell-papers/'],
        ['Britannica — Telephone', 'https://www.britannica.com/technology/telephone'],
      ],
      delta: -6,
      crosscheck: 'Each model reviewed the other two answers. <b>The disagreement got deeper</b> — examining each other’s evidence, the models confirmed this is a genuine, unresolved historical dispute rather than a mistake by any one AI. Confidence in a single answer drops, so the score falls.',
    },
  };

  /* ---------- History (localStorage) ---------- */
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem('concur-history') || '[]'); }
    catch { return []; }
  }
  function saveHistory(q) {
    const h = loadHistory().filter(item => item !== q);
    h.unshift(q);
    localStorage.setItem('concur-history', JSON.stringify(h.slice(0, 8)));
    renderHistory();
  }
  function renderHistory() {
    const h = loadHistory();
    historyList.innerHTML = '';
    if (!h.length) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = 'Your past checks will appear here.';
      historyList.appendChild(empty);
      return;
    }
    for (const q of h) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = q;
      btn.title = q;
      btn.addEventListener('click', () => runCheck(q, 'ask'));
      historyList.appendChild(btn);
    }
  }

  /* ---------- Toast + copy limit ---------- */
  let toastTimer;
  function showToast(msg) {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      t.id = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  // Academic-integrity guard: copying out of Credify is capped at 500
  // characters. Enough to quote — not enough to paste a whole AI answer
  // into an essay. Credify is for checking, not copying.
  const COPY_LIMIT = 500;
  document.addEventListener('copy', (e) => {
    const sel = String(window.getSelection());
    if (sel.length > COPY_LIMIT) {
      e.preventDefault();
      e.clipboardData.setData('text/plain', sel.slice(0, COPY_LIMIT) + '…');
      showToast('Copying is limited to ' + COPY_LIMIT + ' characters — Credify is for checking answers, not copying them.');
    }
  });

  /* ---------- Views ---------- */
  function showView(name) {
    hero.classList.toggle('on', name === 'hero');
    thread.classList.toggle('on', name === 'thread');
    classview.classList.toggle('on', name === 'class');
    app.classList.toggle('chatting', name === 'thread');
    navCheck.classList.toggle('active', name !== 'class');
    navClass.classList.toggle('active', name === 'class');
  }
  navCheck.addEventListener('click', () => {
    // "New check" always returns to the first page, ask card back in place
    if (form.parentElement === dock) {
      hero.insertBefore(form, hero.querySelector('.desc'));
      input.rows = 2;
    }
    showView('hero');
    input.focus();
  });
  navClass.addEventListener('click', () => showView('class'));

  /* ---------- Mode tabs (both copies of the form share one form node) ---------- */
  form.querySelector('.mode-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    mode = btn.dataset.mode;
    for (const b of form.querySelectorAll('.mode-tabs button')) {
      b.classList.toggle('on', b.dataset.mode === mode);
    }
    input.placeholder = mode === 'ask'
      ? 'Ask anything — Credify puts it to every AI at once…'
      : mode === 'link'
        ? 'Paste a link — Credify reads the page and fact-checks its claims…'
        : 'Paste an answer, a paragraph, or an essay to fact-check…';
    input.focus();
  });

  examples.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    input.value = btn.textContent;
    input.focus();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let q = input.value.trim();
    if (!q) return;
    if (mode === 'link') {
      if (!/^https?:\/\//i.test(q)) q = 'https://' + q;
      let ok = false;
      try { ok = new URL(q).hostname.includes('.'); } catch {}
      if (!ok) { showToast('That doesn’t look like a link — paste a full web address.'); return; }
    }
    input.value = '';
    runCheck(q, mode);
  });

  /* ---------- Build one check ---------- */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function scoreColor(score) {
    if (score >= 85) return 'var(--good)';
    if (score >= 70) return 'var(--warn)';
    return 'var(--bad)';
  }
  function scoreWord(score) {
    if (score >= 85) return 'High agreement';
    if (score >= 70) return 'Mostly agree';
    return 'Conflicting';
  }

  function runCheck(q, checkMode, preset, classCode) {
    const demo = (!preset && checkMode === 'ask') ? DEMOS[q.toLowerCase()] : null;
    const usedDeep = preset ? !!preset.deep : deepOn;
    const check = el('section', 'check');

    if (classCode) check.appendChild(el('span', 'check-chip', 'Class question · ' + classCode));
    if (usedDeep && !demo) check.appendChild(el('span', 'check-chip', '🧠 Deep check'));

    // Question / pasted text heading
    const asked = el('h2', 'asked', checkMode === 'paste' ? 'Fact-check: “' + (q.length > 90 ? q.slice(0, 90) + '…' : q) + '”' : q);
    check.appendChild(asked);

    // 1. Agreement score
    const bar = el('div', 'scorebar');
    bar.appendChild(el('span', 'score-label', 'Agreement'));
    const meter = el('div', 'meter');
    const fill = el('i');
    meter.appendChild(fill);
    bar.appendChild(meter);
    let num = null, word = null;
    if (demo) {
      fill.style.width = demo.score + '%';
      fill.style.background = scoreColor(demo.score);
      num = el('span', 'score-num', demo.score + '%');
      num.style.color = scoreColor(demo.score);
      bar.appendChild(num);
      word = el('span', 'score-word', demo.word);
      word.style.color = scoreColor(demo.score);
      bar.appendChild(word);
    } else {
      fill.style.width = '0%';
      word = el('span', 'score-word', 'Scored once the models are connected');
      bar.appendChild(word);
    }
    check.appendChild(bar);

    // Live state + score helpers (shared by first scoring and cross-check)
    const live = { answers: null, score: null };
    function applyScore(s, wordText) {
      s = Math.max(0, Math.min(100, s));
      const color = scoreColor(s);
      fill.style.width = s + '%';
      fill.style.background = color;
      if (!num) { num = el('span', 'score-num', ''); bar.insertBefore(num, word); }
      num.textContent = s + '%';
      num.style.color = color;
      word.textContent = wordText || scoreWord(s);
      word.style.color = color;
    }
    function addDeltaChip(delta) {
      if (delta === 0) return;
      bar.appendChild(el('span',
        'score-delta ' + (delta >= 0 ? 'up' : 'down'),
        (delta >= 0 ? '▲ +' + delta : '▼ ' + delta) + ' after cross-check'));
    }

    // 3. Bottom line
    const bottom = el('div', 'bottomline');
    bottom.appendChild(el('div', 'who', 'Bottom line'));
    const bottomP = el('p', null, demo ? demo.bottom
      : checkMode === 'paste'
        ? 'Credify will break this text into claims and mark each one True, Disputed, or Unverifiable — once the AI models are connected.'
        : 'A plain-language answer you can trust will appear here once the AI models are connected.');
    bottom.appendChild(bottomP);
    check.appendChild(bottom);

    // 2 & 6. Answers with conflict highlighting + claim badges
    const answers = el('div', 'answers');
    MODELS.forEach((model, i) => {
      const row = el('div', 'answer');
      const who = el('div', 'who');
      const dot = el('span', 'dot ' + model.dot);
      who.append(dot, el('span', null, model.name));
      row.appendChild(who);

      const body = el('div');
      if (demo) {
        const what = el('p', 'what');
        what.innerHTML = demo.answers[i].html;
        body.appendChild(what);
        const badges = el('div', 'badges');
        for (const [type, label] of demo.answers[i].badges) {
          badges.appendChild(el('span', 'badge ' + type, label));
        }
        body.appendChild(badges);
      } else {
        body.appendChild(el('p', 'what pending',
          checkMode === 'paste'
            ? model.name + '’s verdict on this text will appear here once its API is connected.'
            : model.name + '’s answer will appear here once its API is connected.'));
      }
      row.appendChild(body);
      answers.appendChild(row);
    });
    check.appendChild(answers);

    // 4. Sources
    const sources = el('div', 'sources');
    sources.appendChild(el('span', 'who', 'Sources'));
    if (demo) {
      for (const [label, url] of demo.sources) {
        const a = document.createElement('a');
        a.href = url; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = label;
        sources.appendChild(a);
      }
    } else {
      sources.appendChild(el('span', null, 'Reliable sources supporting the consensus will be linked here.'));
    }
    check.appendChild(sources);

    // Fill the sources row with real, server-verified links
    function fillSources(list) {
      if (!list || !list.length) return;
      sources.innerHTML = '';
      sources.appendChild(el('span', 'who', 'Sources'));
      for (const s of list) {
        const a = document.createElement('a');
        a.href = s.url; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = s.title;
        sources.appendChild(a);
      }
    }

    // 5 & 9. Actions: cross-check + share
    const actions = el('div', 'actions');
    const crossBtn = el('button', null, '↺ Have the models check each other');
    crossBtn.type = 'button';
    crossBtn.addEventListener('click', () => {
      crossBtn.disabled = true;
      crossBtn.style.opacity = '0.6';
      const note = el('div', 'crosscheck-note');
      check.insertBefore(note, actions);

      // Demo examples: scripted movement (up OR down)
      if (demo) {
        note.innerHTML = '<b>Cross-check:</b> ' + demo.crosscheck;
        if (typeof demo.delta === 'number' && num) {
          applyScore(demo.score + demo.delta);
          addDeltaChip(demo.delta);
        }
        return;
      }

      // Live checks: models genuinely review each other, then re-score.
      if (!live.answers) {
        note.innerHTML = '<b>Cross-check:</b> needs answers from two connected models — wait for the check above to finish, or connect a second model.';
        return;
      }
      note.innerHTML = '<b>Cross-check:</b> the models are reviewing each other’s answers…';
      fetch('/api/crosscheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, mode: checkMode, answers: live.answers, deep: usedDeep }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('bad response'))))
        .then((data) => {
          if (data.error) { note.innerHTML = '<b>Cross-check:</b> ' + data.error; return; }
          const rows = check.querySelectorAll('.answer .what');
          if (data.claude) rows[0].textContent = data.claude;
          if (data.chatgpt) rows[1].textContent = data.chatgpt;
          if (data.agreement && typeof data.agreement.score === 'number') {
            const old = live.score;
            applyScore(data.agreement.score, data.agreement.word);
            if (typeof old === 'number') addDeltaChip(data.agreement.score - old);
            live.score = data.agreement.score;
            if (data.agreement.bottom) bottomP.textContent = data.agreement.bottom;
          }
          if (data.chatgpt && data.claude) {
            live.answers = { chatgpt: data.chatgpt, claude: data.claude };
          }
          note.innerHTML = '<b>Cross-check:</b> ' + (data.note ||
            'each model reviewed the other’s answer and gave its final version above.');
        })
        .catch(() => {
          note.innerHTML = '<b>Cross-check:</b> couldn’t reach the server — is server.py running?';
        });
    });
    const shareBtn = el('button', null, '🔗 Share this check');
    shareBtn.type = 'button';
    shareBtn.addEventListener('click', async () => {
      const text = demo
        ? 'Credify check: “' + q + '”\nAgreement: ' + demo.score + '% (' + demo.word + ')\nBottom line: ' + demo.bottom
        : 'Credify check: “' + q + '” (demo — models not yet connected)';
      try {
        await navigator.clipboard.writeText(text);
        shareBtn.textContent = '✓ Copied to clipboard';
      } catch {
        shareBtn.textContent = 'Copy not available here';
      }
      setTimeout(() => { shareBtn.textContent = '🔗 Share this check'; }, 2200);
    });
    actions.append(crossBtn, shareBtn);
    check.appendChild(actions);

    threadInner.appendChild(check);
    showView('thread');
    thread.scrollTop = thread.scrollHeight;

    // Live mode: for non-demo checks, ask the backend (server.py) for real
    // answers. Falls back silently to the placeholders if no backend exists
    // (e.g. when index.html is opened as a plain file).
    // Stored class-code results: fill directly, no new AI calls
    if (preset) {
      const whats = check.querySelectorAll('.answer .what');
      if (preset.claude) { whats[0].textContent = preset.claude; whats[0].classList.remove('pending'); }
      if (preset.chatgpt) { whats[1].textContent = preset.chatgpt; whats[1].classList.remove('pending'); }
      if (preset.agreement && typeof preset.agreement.score === 'number') {
        applyScore(preset.agreement.score, preset.agreement.word);
        live.score = preset.agreement.score;
        if (preset.agreement.bottom) bottomP.textContent = preset.agreement.bottom;
      }
      if (preset.chatgpt && preset.claude) {
        live.answers = { chatgpt: preset.chatgpt, claude: preset.claude };
      }
      fillSources(preset.sources);
    } else if (!demo) {
      const whats = check.querySelectorAll('.answer .what');
      // rows follow MODELS order: Claude, ChatGPT, Gemini
      const claudeEl = whats[0], gptEl = whats[1];
      const claudeFallback = claudeEl.textContent;
      const gptFallback = gptEl.textContent;
      claudeEl.textContent = 'Claude is thinking…';
      gptEl.textContent = 'ChatGPT is thinking…';
      fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, mode: checkMode, deep: usedDeep }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('bad response'))))
        .then((data) => {
          if (data.chatgpt) {
            gptEl.textContent = data.chatgpt;
            gptEl.classList.remove('pending');
          } else {
            gptEl.textContent = data.chatgpt_error || data.error || gptFallback;
          }
          if (data.claude) {
            claudeEl.textContent = data.claude;
            claudeEl.classList.remove('pending');
          } else {
            claudeEl.textContent = data.claude_error || claudeFallback;
          }
          // Real agreement score + bottom line (needs 2+ connected models)
          if (data.agreement && typeof data.agreement.score === 'number') {
            applyScore(data.agreement.score, data.agreement.word);
            live.score = data.agreement.score;
            if (data.agreement.bottom) bottomP.textContent = data.agreement.bottom;
          }
          if (data.chatgpt && data.claude) {
            live.answers = { chatgpt: data.chatgpt, claude: data.claude };
          }
          fillSources(data.sources);
        })
        .catch(() => {
          const unreachable = 'Couldn’t reach the Credify server — check your connection and try again.';
          gptEl.textContent = unreachable;
          claudeEl.textContent = unreachable;
        });
    }

    // First check: move the chat card into the dock
    if (form.parentElement !== dock) {
      dock.prepend(form);
      input.rows = 1;
    }
    if (checkMode === 'ask') saveHistory(q);
    input.focus();
  }

  /* ---------- Class mode ---------- */
  document.getElementById('classForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const ci = document.getElementById('classInput');
    const q = ci.value.trim();
    if (!q) return;
    const posted = document.getElementById('classPosted');
    posted.innerHTML = '';
    const box = el('div', 'posted');
    box.textContent = 'Checking with the models and creating the class code…';
    posted.appendChild(box);
    fetch('/api/class/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, deep: deepOn }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('bad response'))))
      .then((data) => {
        if (data.error) { box.textContent = data.error; return; }
        ci.value = '';
        box.innerHTML = '';
        box.appendChild(el('div', null, 'Verified! Your citation code:'));
        box.appendChild(el('div', 'classcode', data.code));
        box.appendChild(el('div', null, '“' + data.question + '” — put the code in your work; anyone who enters it sees the same cross-checked result you did.'));
      })
      .catch(() => { box.textContent = 'Couldn’t reach the server — is server.py running?'; });
  });

  document.getElementById('joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const ji = document.getElementById('joinInput');
    const code = ji.value.trim().toUpperCase();
    if (!code) return;
    const errBox = document.getElementById('joinError');
    errBox.innerHTML = '';
    fetch('/api/class/get?code=' + encodeURIComponent(code))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('bad response'))))
      .then((data) => {
        if (data.error) {
          errBox.appendChild(el('div', 'posted', data.error));
          return;
        }
        ji.value = '';
        runCheck(data.question, data.mode || 'ask', data.result, code);
      })
      .catch(() => {
        errBox.appendChild(el('div', 'posted', 'Couldn’t reach the server — is server.py running?'));
      });
  });

  renderHistory();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
