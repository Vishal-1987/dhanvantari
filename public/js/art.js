/* Product illustrations: one drawing per Ayurvedic dosage form, tinted per category. */
(function () {
  const PALETTE = {
    'Immunity': ['#fbe9cf', '#d48a26'],
    'Digestion': ['#e8f0dc', '#6b8f3a'],
    'Stress & Sleep': ['#e6e4f4', '#5d58a6'],
    'Respiratory': ['#dcecf1', '#2f7f93'],
    'Joint & Pain': ['#f6e1d8', '#b5543c'],
    'Heart & BP': ['#f7dfe3', '#b03a54'],
    'Diabetes Care': ['#e2efe9', '#2f7a57'],
    'Skin & Hair': ['#fbe5d6', '#c46a2a'],
    "Women's Health": ['#f5e2ef', '#9c3f7a'],
    'Daily Wellness': ['#e9efe1', '#4f7a3a'],
  };
  const pal = (cat) => PALETTE[cat] || ['#e6efe7', '#17402f'];

  const jar = (c) => `<svg viewBox="0 0 80 80"><rect x="18" y="16" width="44" height="10" rx="3" fill="${c}"/><path d="M20 26h40v34a8 8 0 0 1-8 8H28a8 8 0 0 1-8-8z" fill="#fff" stroke="${c}" stroke-width="2.5"/><rect x="26" y="38" width="28" height="16" rx="3" fill="${c}" opacity=".18"/><path d="M40 40c4 3 5 6 5 8.5S43 53 40 54.5c-3-1.5-5-3.5-5-6S36 43 40 40z" fill="${c}"/></svg>`;
  const bottle = (c) => `<svg viewBox="0 0 80 80"><rect x="33" y="8" width="14" height="9" rx="2" fill="${c}"/><path d="M34 17h12v8c7 3 10 8 10 14v24a7 7 0 0 1-7 7H31a7 7 0 0 1-7-7V39c0-6 3-11 10-14z" fill="#fff" stroke="${c}" stroke-width="2.5"/><rect x="28" y="42" width="24" height="18" rx="3" fill="${c}" opacity=".18"/><path d="M40 44c4 3 5 6 5 8.5S43 57 40 58.5c-3-1.5-5-3.5-5-6S36 47 40 44z" fill="${c}"/></svg>`;
  const pills = (c) => `<svg viewBox="0 0 80 80"><rect x="12" y="22" width="56" height="36" rx="8" fill="#fff" stroke="${c}" stroke-width="2.5"/>${[0, 1, 2].map((i) => [0, 1].map((j) => `<circle cx="${26 + i * 14}" cy="${33 + j * 14}" r="5" fill="${c}" opacity="${0.35 + 0.3 * ((i + j) % 2)}"/>`).join('')).join('')}</svg>`;
  const dropper = (c) => `<svg viewBox="0 0 80 80"><path d="M36 8h8v10h-8z" fill="${c}"/><rect x="32" y="18" width="16" height="8" rx="2" fill="${c}" opacity=".7"/><rect x="26" y="26" width="28" height="44" rx="7" fill="#fff" stroke="${c}" stroke-width="2.5"/><path d="M40 38c4 4 6 7 6 10a6 6 0 0 1-12 0c0-3 2-6 6-10z" fill="${c}"/></svg>`;
  const caps = (c) => `<svg viewBox="0 0 80 80"><g transform="rotate(-35 40 40)"><rect x="16" y="30" width="48" height="20" rx="10" fill="#fff" stroke="${c}" stroke-width="2.5"/><path d="M40 30h14a10 10 0 0 1 0 20H40z" fill="${c}"/></g></svg>`;

  const BY_FORM = { Churna: jar, Avaleha: jar, Ghrita: jar, Vati: pills, Arishta: bottle, Kashayam: bottle, Taila: bottle, Extract: dropper, Capsule: caps };

  window.ART = {
    palette: pal,
    svg(m) { return (BY_FORM[m.form] || jar)(pal(m.category)[1]); },
    bg(m) { return pal(m.category)[0]; },
  };
})();
