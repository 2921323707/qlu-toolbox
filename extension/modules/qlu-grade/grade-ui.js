(() => {
  'use strict';

  const GLOBAL_KEY = '__DODOKOLU_TOOLBOX_GRADE_UI__';
  const HOST_ID = 'qlu-toolbox-grade-host';

  function create(options) {
    const settings = options && typeof options === 'object' ? options : {};
    const onRetry = typeof settings.onRetry === 'function' ? settings.onRetry : function noopRetry() {};
    const onExport = typeof settings.onExport === 'function' ? settings.onExport : function noopExport() {};
    const onClose = typeof settings.onClose === 'function' ? settings.onClose : function noopClose() {};
    const previousActiveElement = document.activeElement;

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.dataset.state = 'idle';
    host.dataset.courseCount = '0';
    host.dataset.componentCount = '0';
    document.body.append(host);

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          color-scheme: dark;
          --ink: #edf8ff;
          --muted: #8ca5b5;
          --line: rgba(190, 231, 255, .15);
          --blue: #61b8ff;
          --cyan: #79edf0;
          --mint: #79f0bd;
          --gold: #ffd16a;
        }
        :host([hidden]) { display: none !important; }
        *, *::before, *::after { box-sizing: border-box; }
        button, input { font: inherit; }
        button { -webkit-tap-highlight-color: transparent; }
        .overlay {
          position: fixed;
          inset: 0;
          z-index: 2147483646;
          display: grid;
          place-items: center;
          overflow: hidden;
          padding: 26px;
          background:
            radial-gradient(circle at 12% 12%, rgba(42, 143, 223, .22), transparent 31%),
            radial-gradient(circle at 90% 88%, rgba(55, 210, 190, .15), transparent 32%),
            rgba(3, 10, 16, .72);
          -webkit-backdrop-filter: blur(18px) saturate(132%);
          backdrop-filter: blur(18px) saturate(132%);
          color: var(--ink);
          font-family: "Aptos", "Segoe UI Variable", "Microsoft YaHei UI", "PingFang SC", sans-serif;
        }
        .overlay::before,
        .overlay::after {
          position: absolute;
          border-radius: 45% 55% 61% 39% / 42% 48% 52% 58%;
          content: "";
          filter: blur(4px);
          mix-blend-mode: screen;
          pointer-events: none;
          will-change: transform, border-radius;
        }
        .overlay::before {
          top: -170px;
          left: -130px;
          width: 430px;
          height: 390px;
          background: radial-gradient(circle at 62% 68%, rgba(61, 162, 255, .38), transparent 68%);
          animation: liquid 16s ease-in-out infinite alternate;
        }
        .overlay::after {
          right: -150px;
          bottom: -180px;
          width: 450px;
          height: 420px;
          background: radial-gradient(circle at 38% 35%, rgba(73, 232, 209, .24), transparent 67%);
          animation: liquid 19s ease-in-out -6s infinite alternate-reverse;
        }
        .ledger {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-rows: auto auto minmax(0, 1fr);
          width: min(1020px, 100%);
          max-height: min(850px, calc(100vh - 52px));
          overflow: hidden;
          border: 1px solid rgba(208, 239, 255, .2);
          border-radius: 32px;
          background:
            linear-gradient(145deg, rgba(255, 255, 255, .11), rgba(255, 255, 255, .025) 44%),
            rgba(8, 23, 34, .82);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, .15),
            0 36px 110px rgba(0, 5, 10, .55);
          -webkit-backdrop-filter: blur(36px) saturate(135%);
          backdrop-filter: blur(36px) saturate(135%);
          animation: panel-in .56s cubic-bezier(.2, .8, .2, 1) both;
        }
        .ledger::before {
          position: absolute;
          inset: 0;
          z-index: -1;
          border-radius: inherit;
          background: linear-gradient(125deg, rgba(255,255,255,.06), transparent 30%, transparent 70%, rgba(93,190,255,.04));
          content: "";
          pointer-events: none;
        }
        .masthead {
          position: relative;
          overflow: hidden;
          padding: 22px 28px 24px;
          border-bottom: 1px solid var(--line);
          background:
            radial-gradient(circle at 88% 0%, rgba(76, 181, 255, .17), transparent 36%),
            linear-gradient(120deg, rgba(16, 48, 68, .74), rgba(9, 28, 41, .25));
        }
        .topbar,
        .brand-lockup,
        .brand-symbol,
        .hero,
        .metrics,
        .toolbar,
        .toolbar-actions,
        .privacy,
        .course-head,
        .course-aside,
        .state-mark { display: flex; align-items: center; }
        .topbar { justify-content: space-between; }
        .brand-lockup { gap: 10px; }
        .brand-symbol {
          position: relative;
          display: grid;
          grid-template-columns: repeat(2, 9px);
          grid-template-rows: repeat(2, 9px);
          gap: 2px;
          width: 30px;
          height: 30px;
          place-content: center;
          border: 1px solid rgba(199, 235, 255, .18);
          border-radius: 10px;
          background: rgba(255, 255, 255, .06);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.12);
        }
        .brand-symbol i {
          display: block;
          width: 9px;
          height: 9px;
          border-radius: 3px;
          background: linear-gradient(145deg, #2f94f5, #62c6ff);
        }
        .brand-symbol i:last-child { background: linear-gradient(145deg, #ffd05d, #f7b938); }
        .brand-name {
          display: block;
          color: #dcecf5;
          font: 650 11px/1.1 "Bahnschrift", "Aptos", sans-serif;
          letter-spacing: .11em;
        }
        .brand-edition {
          display: block;
          margin-top: 3px;
          color: #688596;
          font: 600 8px/1 "Bahnschrift", sans-serif;
          letter-spacing: .15em;
        }
        .close {
          display: grid;
          width: 38px;
          height: 38px;
          place-items: center;
          border: 1px solid rgba(208, 239, 255, .16);
          border-radius: 13px;
          background: rgba(255, 255, 255, .055);
          color: #cbe1ed;
          cursor: pointer;
          font-size: 21px;
          line-height: 1;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.09);
          transition: background .18s ease, transform .18s ease;
        }
        .close:hover { background: rgba(255,255,255,.11); transform: rotate(4deg); }
        .close:focus-visible,
        .retry:focus-visible,
        .export-button:focus-visible,
        .privacy input:focus-visible { outline: 3px solid rgba(106, 212, 255, .43); outline-offset: 3px; }
        .hero { align-items: flex-end; justify-content: space-between; gap: 28px; margin-top: 26px; }
        .hero-copy { min-width: 0; }
        .eyebrow {
          margin: 0 0 8px;
          color: #78b8d8;
          font: 650 9px/1.2 "Bahnschrift", "Aptos Narrow", sans-serif;
          letter-spacing: .19em;
        }
        h1 {
          margin: 0;
          color: #f0f9fe;
          font-family: "Bahnschrift", "Aptos Display", "Microsoft YaHei UI", sans-serif;
          font-size: clamp(26px, 4vw, 34px);
          font-weight: 610;
          letter-spacing: .02em;
          line-height: 1.15;
        }
        .subtitle { margin: 8px 0 0; color: #91aaba; font-size: 12px; line-height: 1.65; }
        .metrics { flex: 0 0 auto; gap: 9px; }
        .metric {
          display: grid;
          min-width: 100px;
          min-height: 70px;
          align-content: center;
          border: 1px solid rgba(194, 230, 251, .13);
          border-radius: 18px;
          padding: 11px 13px;
          background: linear-gradient(145deg, rgba(255,255,255,.085), rgba(255,255,255,.025));
          box-shadow: inset 0 1px 0 rgba(255,255,255,.09);
          -webkit-backdrop-filter: blur(18px);
          backdrop-filter: blur(18px);
        }
        .metric.primary { border-color: rgba(111, 232, 236, .21); background: linear-gradient(145deg, rgba(77, 213, 216, .13), rgba(39, 100, 125, .035)); }
        .metric-label { color: #6f8999; font-size: 9px; font-weight: 650; letter-spacing: .04em; }
        .metric-value { margin-top: 3px; color: #e9f7fd; font: 660 19px/1.1 "Bahnschrift", "Aptos", sans-serif; font-variant-numeric: tabular-nums; }
        .metric.primary .metric-value { color: #85eff0; }
        .metric-note { margin-top: 3px; color: #617d8f; font-size: 8px; white-space: nowrap; }
        .toolbar {
          justify-content: space-between;
          gap: 18px;
          min-height: 66px;
          padding: 12px 28px;
          border-bottom: 1px solid var(--line);
          background: rgba(255,255,255,.025);
        }
        .count { color: #8ba4b4; font-size: 11px; line-height: 1.5; }
        .toolbar-actions { gap: 10px; }
        .export-button,
        .retry {
          min-height: 38px;
          border: 0;
          border-radius: 13px;
          padding: 0 15px;
          background: linear-gradient(135deg, #8ceeff, #62b4ff);
          color: #07131d;
          cursor: pointer;
          font-weight: 730;
          font-size: 10px;
          box-shadow: 0 9px 24px rgba(46, 154, 226, .24), inset 0 1px 0 rgba(255,255,255,.58);
          transition: transform .18s ease, filter .18s ease;
        }
        .export-button:hover:not(:disabled), .retry:hover { filter: brightness(1.06); transform: translateY(-1px); }
        .export-button:active:not(:disabled), .retry:active { transform: translateY(1px); }
        .export-button:disabled { cursor: default; filter: saturate(.35); opacity: .48; box-shadow: none; }
        .privacy {
          gap: 7px;
          min-height: 38px;
          border: 1px solid rgba(187, 226, 247, .13);
          border-radius: 13px;
          padding: 0 12px;
          background: rgba(255,255,255,.035);
          color: #8099a9;
          cursor: pointer;
          font-size: 9px;
          user-select: none;
        }
        .privacy input { width: 13px; height: 13px; margin: 0; accent-color: #6ad7dd; }
        .content {
          overflow: auto;
          padding: 22px 28px 30px;
          scrollbar-color: rgba(119, 176, 205, .35) transparent;
          scrollbar-width: thin;
        }
        .content::-webkit-scrollbar { width: 6px; }
        .content::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(119, 176, 205, .28); }
        .state { min-height: 330px; display: grid; place-items: center; text-align: center; }
        .state-box { max-width: 520px; }
        .state-mark {
          position: relative;
          width: 58px;
          height: 58px;
          justify-content: center;
          margin: 0 auto 18px;
          border: 1px solid rgba(112, 218, 255, .2);
          border-radius: 21px;
          background: linear-gradient(145deg, rgba(83, 189, 255, .14), rgba(255,255,255,.02));
          color: #88dfff;
          font: 620 20px/1 "Bahnschrift", sans-serif;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.1), 0 15px 35px rgba(0,10,18,.22);
        }
        .state-mark.loading::before {
          width: 24px;
          height: 24px;
          border: 2px solid rgba(134, 218, 250, .22);
          border-top-color: #86ddfa;
          border-radius: 50%;
          content: "";
          animation: spin .85s linear infinite;
        }
        .state h2 { margin: 0 0 8px; color: #e2f0f7; font-size: 18px; font-weight: 640; }
        .state p { margin: 0; color: #718b9b; font-size: 11px; line-height: 1.75; white-space: pre-line; }
        .retry { margin-top: 17px; }
        .course-list { display: grid; gap: 12px; }
        .course {
          overflow: hidden;
          border: 1px solid rgba(188, 225, 246, .12);
          border-radius: 22px;
          background:
            linear-gradient(140deg, rgba(255,255,255,.075), rgba(255,255,255,.018) 52%),
            rgba(9, 26, 38, .68);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.075), 0 12px 30px rgba(0,8,14,.14);
          animation: course-in .42s cubic-bezier(.2,.8,.2,1) both;
        }
        .course-head { justify-content: space-between; gap: 18px; padding: 16px 18px 14px; border-bottom: 1px solid rgba(191, 228, 248, .1); }
        .course-name { margin: 0; color: #e4f1f7; font-size: 14px; font-weight: 640; line-height: 1.45; overflow-wrap: anywhere; }
        .course-meta { margin: 5px 0 0; color: #668293; font-size: 9px; line-height: 1.55; overflow-wrap: anywhere; }
        .course-aside { flex: 0 0 auto; gap: 7px; }
        .credit {
          min-width: 54px;
          border: 1px solid rgba(117, 207, 250, .12);
          border-radius: 10px;
          padding: 6px 8px;
          background: rgba(82, 168, 213, .08);
          color: #82bedb;
          text-align: center;
          font: 640 9px/1.25 "Bahnschrift", "Aptos", sans-serif;
        }
        .components { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .component { position: relative; min-width: 0; padding: 14px 18px 16px; border-right: 1px solid rgba(193, 229, 248, .08); border-bottom: 1px solid rgba(193, 229, 248, .08); }
        .component:nth-child(4n) { border-right: 0; }
        .component.final { background: linear-gradient(145deg, rgba(84, 218, 212, .09), transparent 68%); }
        .component-name { display: block; margin-bottom: 6px; color: #658293; font-size: 9px; line-height: 1.45; overflow-wrap: anywhere; }
        .component.final .component-name { color: #74aaa9; }
        .score { display: block; color: #d9eaf2; font: 660 19px/1.2 "Bahnschrift", "Aptos", sans-serif; font-variant-numeric: tabular-nums; transition: filter .18s, opacity .18s; overflow-wrap: anywhere; }
        .component.final .score { color: #81e8e7; }
        .ledger.masked .score,
        .ledger.masked .gpa-value { filter: blur(8px); opacity: .65; user-select: none; }
        @keyframes panel-in { from { opacity: 0; transform: translateY(12px) scale(.985); } }
        @keyframes course-in { from { opacity: 0; transform: translateY(8px); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes liquid {
          0% { transform: translate3d(0,0,0) rotate(0) scale(1); border-radius: 45% 55% 61% 39% / 42% 48% 52% 58%; }
          55% { transform: translate3d(34px,20px,0) rotate(8deg) scale(1.08); border-radius: 59% 41% 45% 55% / 55% 39% 61% 45%; }
          100% { transform: translate3d(-12px,42px,0) rotate(-6deg) scale(.96); border-radius: 38% 62% 55% 45% / 61% 43% 57% 39%; }
        }
        @media (max-width: 800px) {
          .overlay { padding: 0; place-items: stretch; }
          .ledger { width: 100%; max-height: 100vh; border-radius: 0; }
          .masthead { padding: 18px 18px 20px; }
          .hero { align-items: stretch; flex-direction: column; gap: 18px; margin-top: 22px; }
          .metrics { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); }
          .metric { min-width: 0; }
          .toolbar { align-items: flex-start; flex-direction: column; padding: 12px 18px; }
          .toolbar-actions { width: 100%; }
          .export-button, .privacy { flex: 1 1 0; justify-content: center; }
          .content { padding: 16px 14px 24px; }
          .components { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .component:nth-child(4n) { border-right: 1px solid rgba(193, 229, 248, .08); }
          .component:nth-child(2n) { border-right: 0; }
        }
        @media (max-width: 480px) {
          .metrics { gap: 6px; }
          .metric { min-height: 64px; padding: 9px; }
          .metric-value { font-size: 16px; }
          .metric-note { overflow: hidden; text-overflow: ellipsis; }
          .course-head { align-items: flex-start; }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
        }

        /* Minimal white theme: warm paper, graphite type, champagne as the only accent. */
        :host {
          color-scheme: light;
          --ink: #29251f;
          --muted: #82796e;
          --line: rgba(65, 59, 52, .15);
          --blue: #3a3631;
          --cyan: #72695e;
          --mint: #667260;
          --gold: #af8749;
        }
        .overlay {
          background:
            radial-gradient(circle at 8% 6%, rgba(220, 214, 202, .78), transparent 31%),
            radial-gradient(circle at 94% 88%, rgba(226, 224, 214, .72), transparent 34%),
            rgba(249, 248, 244, .82);
          color: var(--ink);
          -webkit-backdrop-filter: blur(18px) saturate(108%);
          backdrop-filter: blur(18px) saturate(108%);
        }
        .overlay::before,
        .overlay::after {
          opacity: .34;
          mix-blend-mode: multiply;
        }
        .overlay::before { background: radial-gradient(circle at 62% 68%, rgba(178, 169, 154, .24), transparent 68%); }
        .overlay::after { background: radial-gradient(circle at 38% 35%, rgba(191, 187, 174, .2), transparent 67%); }
        .ledger {
          border-color: rgba(70, 63, 53, .18);
          background: linear-gradient(145deg, rgba(255, 254, 251, .98), rgba(248, 246, 241, .94) 44%), rgba(255, 254, 251, .96);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, .98), 0 36px 100px rgba(65, 58, 48, .2);
          -webkit-backdrop-filter: blur(28px) saturate(105%);
          backdrop-filter: blur(28px) saturate(105%);
        }
        .ledger::before { background: linear-gradient(125deg, rgba(255,255,255,.82), transparent 30%, transparent 70%, rgba(169,158,141,.05)); }
        .masthead {
          border-bottom-color: rgba(74, 67, 58, .14);
          background: radial-gradient(circle at 88% 0%, rgba(208, 197, 177, .17), transparent 36%), linear-gradient(120deg, rgba(255,254,251,.97), rgba(247,244,237,.82));
        }
        .brand-symbol { border-color: rgba(76, 68, 58, .18); background: rgba(255, 254, 251, .78); box-shadow: inset 0 1px 0 rgba(255,255,255,.98); }
        .brand-symbol i { background: linear-gradient(145deg, #68635b, #37332e); }
        .brand-symbol i:last-child { background: linear-gradient(145deg, #c6a46a, #a47a3e); }
        .brand-name { color: #2e2a25; }
        .brand-edition { color: #8b8175; }
        .close { border-color: rgba(70, 63, 54, .18); background: rgba(255, 254, 251, .82); color: #413b34; box-shadow: inset 0 1px 0 rgba(255,255,255,.98); }
        .close:hover { background: rgba(238, 235, 228, .96); }
        .close:focus-visible,
        .retry:focus-visible,
        .export-button:focus-visible,
        .privacy input:focus-visible { outline-color: rgba(93, 84, 73, .42); }
        .eyebrow { color: #867a6c; }
        h1 { color: #28241f; }
        .subtitle { color: #766d62; }
        .metric { border-color: rgba(75, 67, 57, .14); background: linear-gradient(145deg, rgba(255,254,251,.96), rgba(246,243,237,.84)); box-shadow: inset 0 1px 0 rgba(255,255,255,.96); }
        .metric.primary { border-color: rgba(174, 135, 73, .3); background: linear-gradient(145deg, rgba(251,246,235,.96), rgba(255,254,251,.88)); }
        .metric-label { color: #887e72; }
        .metric-value { color: #312c26; }
        .metric.primary .metric-value { color: #8b6b3d; }
        .metric-note { color: #958b7e; }
        .toolbar { border-bottom-color: rgba(74, 67, 58, .14); background: rgba(255,254,251,.72); }
        .count { color: #756c61; }
        .export-button,
        .retry { background: linear-gradient(135deg, #4a4640, #292622); color: #fff; box-shadow: 0 9px 20px rgba(54, 49, 43, .18), inset 0 1px 0 rgba(255,255,255,.18); }
        .privacy { border-color: rgba(75, 68, 58, .15); background: rgba(255,254,251,.82); color: #756c61; }
        .content { scrollbar-color: rgba(105, 95, 83, .32) transparent; }
        .content::-webkit-scrollbar-thumb { background: rgba(105, 95, 83, .26); }
        .state-mark { border-color: rgba(77, 69, 59, .17); background: linear-gradient(145deg, rgba(244,241,235,.96), rgba(255,254,251,.8)); color: #766b5f; box-shadow: inset 0 1px 0 rgba(255,255,255,.98), 0 15px 35px rgba(72,64,53,.12); }
        .state-mark.loading::before { border-color: rgba(119, 108, 94, .2); border-top-color: #776b5e; }
        .state h2 { color: #332e28; }
        .state p { color: #7e7468; }
        .course { border-color: rgba(77, 69, 59, .15); background: linear-gradient(140deg, rgba(255,254,251,.96), rgba(247,244,238,.86) 52%), rgba(255,254,251,.92); box-shadow: inset 0 1px 0 rgba(255,255,255,.98), 0 12px 30px rgba(72,64,53,.1); }
        .course-head { border-bottom-color: rgba(77, 69, 59, .11); }
        .course-name { color: #322d27; }
        .course-meta { color: #8a8074; }
        .credit { border-color: rgba(87, 75, 58, .15); background: rgba(189, 160, 108, .1); color: #846840; }
        .component { border-right-color: rgba(77, 69, 59, .09); border-bottom-color: rgba(77, 69, 59, .09); }
        .component:nth-child(4n),
        .component:nth-child(2n) { border-right-color: rgba(77, 69, 59, .09); }
        .component.final { background: linear-gradient(145deg, rgba(207, 177, 115, .14), transparent 68%); }
        .component-name { color: #8a8074; }
        .component.final .component-name { color: #8d744f; }
        .score { color: #39342d; }
        .component.final .score { color: #8b6b3d; }

        /* Forest editorial theme: cream surfaces, deep green actions, champagne data accent. */
        :host {
          --ink: #18392d;
          --muted: #6c776f;
          --line: rgba(36, 76, 58, .17);
          --blue: #204d3b;
          --cyan: #647767;
          --mint: #4f765e;
          --gold: #b58a4c;
        }
        .overlay {
          background:
            radial-gradient(circle at 8% 6%, rgba(105, 132, 102, .46), transparent 31%),
            radial-gradient(circle at 94% 88%, rgba(202, 187, 149, .43), transparent 34%),
            rgba(237, 233, 221, .86);
        }
        .overlay::before { background: radial-gradient(circle at 62% 68%, rgba(65, 99, 74, .22), transparent 68%); }
        .overlay::after { background: radial-gradient(circle at 38% 35%, rgba(158, 148, 112, .18), transparent 67%); }
        .ledger {
          border-color: rgba(35, 74, 56, .21);
          background: linear-gradient(145deg, rgba(255,253,246,.98), rgba(238,238,225,.95) 44%), rgba(255,253,246,.97);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.98), 0 36px 100px rgba(32, 64, 47, .22);
        }
        .ledger::before { background: linear-gradient(125deg, rgba(255,255,255,.82), transparent 30%, transparent 70%, rgba(71,106,77,.06)); }
        .masthead {
          border-bottom-color: rgba(35, 74, 56, .15);
          background: radial-gradient(circle at 88% 0%, rgba(183, 157, 104, .17), transparent 36%), linear-gradient(120deg, rgba(250,248,238,.98), rgba(230,234,219,.88));
        }
        .brand-symbol { border-color: rgba(35, 75, 56, .23); background: rgba(255,253,246,.84); }
        .brand-symbol i { background: linear-gradient(145deg, #4e765e, #173f30); }
        .brand-symbol i:last-child { background: linear-gradient(145deg, #c9a667, #a77b3e); }
        .brand-name { color: #173b2e; }
        .brand-edition { color: #718074; }
        .close { border-color: rgba(35, 75, 56, .22); background: rgba(255,253,246,.88); color: #214936; }
        .close:hover { background: rgba(225,233,218,.97); }
        .close:focus-visible,
        .retry:focus-visible,
        .export-button:focus-visible,
        .privacy input:focus-visible { outline-color: rgba(47, 94, 70, .45); }
        .eyebrow { color: #557361; }
        h1 { color: #173b2e; }
        .subtitle { color: #647369; }
        .metric { border-color: rgba(39, 76, 59, .16); background: linear-gradient(145deg, rgba(255,253,246,.97), rgba(235,237,224,.87)); }
        .metric.primary { border-color: rgba(181, 138, 76, .36); background: linear-gradient(145deg, rgba(249,243,228,.97), rgba(255,253,246,.9)); }
        .metric-label { color: #69766c; }
        .metric-value { color: #19392d; }
        .metric.primary .metric-value { color: #94703d; }
        .metric-note { color: #7c867f; }
        .toolbar { border-bottom-color: rgba(36, 76, 58, .14); background: rgba(255,253,246,.77); }
        .count { color: #647269; }
        .export-button,
        .retry { background: linear-gradient(135deg, #356b51, #173f30); color: #fff; box-shadow: 0 9px 20px rgba(28,73,55,.22), inset 0 1px 0 rgba(255,255,255,.18); }
        .privacy { border-color: rgba(39, 76, 59, .17); background: rgba(255,253,246,.88); color: #65736a; }
        .content { scrollbar-color: rgba(63, 100, 75, .34) transparent; }
        .content::-webkit-scrollbar-thumb { background: rgba(63, 100, 75, .29); }
        .state-mark { border-color: rgba(39, 78, 59, .2); background: linear-gradient(145deg, rgba(226,234,217,.97), rgba(255,253,246,.84)); color: #3d6750; box-shadow: inset 0 1px 0 rgba(255,255,255,.98), 0 15px 35px rgba(34,67,50,.13); }
        .state-mark.loading::before { border-color: rgba(69, 105, 80, .22); border-top-color: #315f47; }
        .state h2 { color: #1c4031; }
        .state p { color: #6b776e; }
        .course { border-color: rgba(38, 75, 58, .17); background: linear-gradient(140deg, rgba(255,253,246,.97), rgba(238,238,225,.89) 52%), rgba(255,253,246,.93); box-shadow: inset 0 1px 0 rgba(255,255,255,.98), 0 12px 30px rgba(35,67,50,.11); }
        .course-head { border-bottom-color: rgba(38, 75, 58, .12); }
        .course-name { color: #1c3e31; }
        .course-meta { color: #718076; }
        .credit { border-color: rgba(151, 116, 65, .2); background: rgba(195, 160, 99, .12); color: #85663c; }
        .component,
        .component:nth-child(4n),
        .component:nth-child(2n) { border-right-color: rgba(38, 75, 58, .1); border-bottom-color: rgba(38, 75, 58, .1); }
        .component.final { background: linear-gradient(145deg, rgba(115, 145, 110, .14), rgba(202,171,111,.06) 70%); }
        .component-name { color: #718076; }
        .component.final .component-name { color: #63735f; }
        .score { color: #233e32; }
        .component.final .score { color: #8f6c3d; }
      </style>
      <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="qlu-toolbox-grade-title" aria-describedby="qlu-toolbox-grade-subtitle">
        <section class="ledger">
          <header class="masthead">
            <div class="topbar">
              <div class="brand-lockup">
                <span class="brand-symbol" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
                <span><strong class="brand-name">QLU TOOLBOX</strong><small class="brand-edition">BROWSER EDITION</small></span>
              </div>
              <button class="close" type="button" aria-label="关闭成绩分项窗口">×</button>
            </div>
            <div class="hero">
              <div class="hero-copy">
                <p class="eyebrow">ACADEMIC / LIVE DATA</p>
                <h1 id="qlu-toolbox-grade-title">成绩分项</h1>
                <p class="subtitle" id="qlu-toolbox-grade-subtitle">直接读取当前教务会话，在本地整理课程、分项与绩点。</p>
              </div>
              <div class="metrics" aria-label="成绩概览">
                <div class="metric"><span class="metric-label">课程</span><strong class="metric-value course-value">—</strong><small class="metric-note">当前结果</small></div>
                <div class="metric primary"><span class="metric-label">加权 GPA</span><strong class="metric-value gpa-value">—</strong><small class="metric-note gpa-note">满绩点 5.0</small></div>
                <div class="metric"><span class="metric-label">查询范围</span><strong class="metric-value term-value">—</strong><small class="metric-note term-note">读取页面选项</small></div>
              </div>
            </div>
          </header>
          <div class="toolbar">
            <span class="count" aria-live="polite">正在连接教务系统</span>
            <div class="toolbar-actions">
              <button class="export-button" type="button" disabled>导出 Excel</button>
              <label class="privacy"><input type="checkbox"> 隐藏分数</label>
            </div>
          </div>
          <main class="content" aria-live="polite"></main>
        </section>
      </div>`;

    const overlay = shadow.querySelector('.overlay');
    const ledger = shadow.querySelector('.ledger');
    const content = shadow.querySelector('.content');
    const count = shadow.querySelector('.count');
    const termValue = shadow.querySelector('.term-value');
    const termNote = shadow.querySelector('.term-note');
    const courseValue = shadow.querySelector('.course-value');
    const gpaValue = shadow.querySelector('.gpa-value');
    const gpaNote = shadow.querySelector('.gpa-note');
    const exportButton = shadow.querySelector('.export-button');
    const privacyToggle = shadow.querySelector('.privacy input');
    const closeButton = shadow.querySelector('.close');

    function clearContent() {
      while (content.firstChild) content.firstChild.remove();
    }

    function setState(state) {
      host.dataset.state = state;
    }

    function clearExportState() {
      exportButton.disabled = true;
    }

    function resetCounts() {
      host.dataset.courseCount = '0';
      host.dataset.componentCount = '0';
      courseValue.textContent = '—';
      gpaValue.textContent = '—';
      gpaNote.textContent = '等待总评成绩';
    }

    function focusClose() {
      closeButton.focus({ preventScroll: true });
    }

    function setTerm(yearText, termText) {
      const year = yearText == null ? '' : String(yearText).trim();
      const term = termText == null ? '' : String(termText).trim();
      termValue.textContent = term || '全部';
      termNote.textContent = year || '全部学年';
    }

    function setExportEnabled(enabled) {
      exportButton.disabled = !enabled;
    }

    function showLoading() {
      host.hidden = false;
      clearExportState();
      resetCounts();
      setState('loading');
      count.textContent = '正在连接教务系统';
      clearContent();
      const wrapper = document.createElement('div');
      wrapper.className = 'state';
      const box = document.createElement('div');
      box.className = 'state-box';
      const mark = document.createElement('div');
      mark.className = 'state-mark loading';
      mark.setAttribute('aria-hidden', 'true');
      const heading = document.createElement('h2');
      heading.textContent = '正在读取成绩分项';
      const paragraph = document.createElement('p');
      paragraph.textContent = '教务系统正在生成临时成绩表，通常只需几秒。';
      box.append(mark, heading, paragraph);
      wrapper.append(box);
      content.append(wrapper);
    }

    function showError(errorState) {
      const details = errorState && typeof errorState === 'object' ? errorState : {};
      host.hidden = false;
      clearExportState();
      resetCounts();
      setState(details.state || 'error');
      count.textContent = details.countText || '未读取到成绩';
      clearContent();
      const wrapper = document.createElement('div');
      wrapper.className = 'state';
      const box = document.createElement('div');
      box.className = 'state-box';
      const mark = document.createElement('div');
      mark.className = 'state-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = '!';
      const heading = document.createElement('h2');
      heading.textContent = details.title || '查询没有完成';
      const paragraph = document.createElement('p');
      paragraph.textContent = details.message || '教务系统暂时不可用，或网络连接中断。稍后可直接重新查询。';
      box.append(mark, heading, paragraph);
      if (details.retry !== false) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'retry';
        button.textContent = '重新查询';
        button.addEventListener('click', function retryClick() {
          onRetry();
        });
        box.append(button);
      }
      wrapper.append(box);
      content.append(wrapper);
    }

    function appendMeta(target, parts) {
      let text = '';
      for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        if (!part) continue;
        if (text) text += ' · ';
        text += String(part);
      }
      target.textContent = text || '课程信息';
    }

    function renderCourses(groups, gpaSummary) {
      host.hidden = false;
      clearContent();
      const list = document.createElement('div');
      list.className = 'course-list';
      let componentCount = 0;
      const safeGroups = Array.isArray(groups) ? groups : [];
      for (let groupIndex = 0; groupIndex < safeGroups.length; groupIndex += 1) {
        const group = safeGroups[groupIndex] || {};
        const article = document.createElement('article');
        article.className = 'course';
        const head = document.createElement('div');
        head.className = 'course-head';
        const titleBox = document.createElement('div');
        const title = document.createElement('h2');
        title.className = 'course-name';
        title.textContent = group.course || '未命名课程';
        const meta = document.createElement('p');
        meta.className = 'course-meta';
        appendMeta(meta, [group.code, group.department, group.className]);
        titleBox.append(title, meta);
        const aside = document.createElement('div');
        aside.className = 'course-aside';
        const credit = document.createElement('span');
        credit.className = 'credit';
        credit.textContent = group.credit ? `${group.credit} 学分` : '学分 —';
        aside.append(credit);
        head.append(titleBox, aside);

        const components = document.createElement('div');
        components.className = 'components';
        const safeComponents = Array.isArray(group.components) ? group.components : [];
        for (let componentIndex = 0; componentIndex < safeComponents.length; componentIndex += 1) {
          const component = safeComponents[componentIndex] || {};
          const componentName = component.name || '总评';
          componentCount += 1;
          const item = document.createElement('div');
          item.className = 'component';
          if (String(componentName).replace(/\s+/g, '') === '总评' || String(componentName).replace(/\s+/g, '') === '总评成绩') {
            item.classList.add('final');
          }
          const name = document.createElement('span');
          name.className = 'component-name';
          name.textContent = componentName;
          const score = document.createElement('strong');
          score.className = 'score';
          score.textContent = component.score || '—';
          item.append(name, score);
          components.append(item);
        }
        article.append(head, components);
        list.append(article);
      }
      content.append(list);
      host.dataset.courseCount = String(safeGroups.length);
      host.dataset.componentCount = String(componentCount);
      courseValue.textContent = String(safeGroups.length);
      const summary = gpaSummary && typeof gpaSummary === 'object' ? gpaSummary : {};
      if (typeof summary.average === 'number' && Number.isFinite(summary.average)) {
        gpaValue.textContent = summary.average.toFixed(3);
        gpaNote.textContent = `${summary.includedCourses || 0} 门课程 · ${Number(summary.totalCredits || 0).toFixed(1)} 学分`;
      } else {
        gpaValue.textContent = '—';
        gpaNote.textContent = '暂无可计算总评';
      }
      count.textContent = `${safeGroups.length} 门课程 · ${componentCount} 个成绩分项`;
      setState('success');
    }

    function close() {
      clearExportState();
      clearContent();
      privacyToggle.checked = false;
      ledger.classList.remove('masked');
      resetCounts();
      setState('closed');
      host.hidden = true;
      onClose();
      if (previousActiveElement && previousActiveElement.isConnected && typeof previousActiveElement.focus === 'function') {
        previousActiveElement.focus({ preventScroll: true });
      }
    }

    function reopen() {
      const wasClosed = host.hidden || host.dataset.state === 'closed';
      host.hidden = false;
      focusClose();
      return wasClosed;
    }

    function isClosed() {
      return host.hidden || host.dataset.state === 'closed';
    }

    function trapFocus(event) {
      if (event.key !== 'Tab') return;
      const candidates = shadow.querySelectorAll('button:not(:disabled), input:not(:disabled)');
      if (!candidates.length) return;
      const first = candidates[0];
      const last = candidates[candidates.length - 1];
      const active = shadow.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    closeButton.addEventListener('click', close);
    overlay.addEventListener('click', function overlayClick(event) {
      if (event.target === overlay) close();
    });
    shadow.addEventListener('keydown', function dialogKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      trapFocus(event);
    });
    exportButton.addEventListener('click', function exportClick() {
      if (!exportButton.disabled) onExport();
    });
    privacyToggle.addEventListener('change', function privacyChanged() {
      ledger.classList.toggle('masked', privacyToggle.checked);
    });

    const controller = Object.freeze({
      host,
      shadow,
      showLoading,
      showError,
      renderCourses,
      setTerm,
      setExportEnabled,
      clearExportState,
      close,
      reopen,
      isClosed,
      focusClose,
    });

    focusClose();
    return controller;
  }

  const api = Object.freeze({ HOST_ID, create });
  Object.defineProperty(globalThis, GLOBAL_KEY, {
    value: api,
    configurable: true,
    enumerable: false,
    writable: false,
  });
})();
