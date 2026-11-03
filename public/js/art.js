/* Product packshots drawn in SVG: one container per Ayurvedic dosage form, with a printed
   label carrying the product name, tinted by category. No external images needed. */
(function () {
  // category: [soft background, label colour, deep accent]
  const PALETTE = {
    'Immunity': ['#fbecd6', '#c97a1e', '#8a4f0c'],
    'Digestion': ['#e9f0dd', '#5e8a32', '#3c5c1c'],
    'Stress & Sleep': ['#e8e6f5', '#5a55a3', '#38347a'],
    'Respiratory': ['#dcedf2', '#2b7a8e', '#195464'],
    'Joint & Pain': ['#f6e3da', '#ae5034', '#7a311d'],
    'Heart & BP': ['#f7e1e5', '#a8374f', '#741e33'],
    'Diabetes Care': ['#e1efe8', '#2d7553', '#184a33'],
    'Skin & Hair': ['#fbe7d8', '#c0652a', '#86410f'],
    "Women's Health": ['#f5e3ef', '#954078', '#652750'],
    'Daily Wellness': ['#e9efdf', '#4d7a38', '#30521f'],
  };
  const pal = (cat) => PALETTE[cat] || ['#e7f0e8', '#2d7553', '#143a2b'];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let uid = 0;

  /** Splits a product name into at most two label lines. */
  function lines(name, max) {
    const words = name.split(/\s+/);
    const out = [''];
    for (const w of words) {
      const cur = out[out.length - 1];
      if (!cur) out[out.length - 1] = w;
      else if ((cur + ' ' + w).length <= max) out[out.length - 1] = cur + ' ' + w;
      else out.push(w);
    }
    if (out.length > 2) out.splice(1, out.length - 1, out.slice(1).join(' '));
    return out.map((l) => (l.length > max + 2 ? l.slice(0, max + 1) + '…' : l));
  }

  /** The printed label: brand line, product name, form · pack. Centred on cx within width w. */
  function label(m, cx, y, w, h, color, textColor = '#fff', size = 13) {
    const L = lines(m.name, Math.floor(w / (size * 0.56)));
    const nameY = y + h / 2 + (L.length === 1 ? 4 : -3);
    return `
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="4" fill="${color}"/>
      <rect x="${cx - w / 2}" y="${y + 3}" width="${w}" height="1" fill="${textColor}" opacity=".35"/>
      <rect x="${cx - w / 2}" y="${y + h - 4}" width="${w}" height="1" fill="${textColor}" opacity=".35"/>
      <text x="${cx}" y="${y + 14}" text-anchor="middle" font-family="Inter,Arial" font-size="6.5" font-weight="700" letter-spacing="1.6" fill="${textColor}" opacity=".85">DHANVANTARI</text>
      ${L.map((l, i) => `<text x="${cx}" y="${nameY + i * (size + 2)}" text-anchor="middle" font-family="Fraunces,Georgia,serif" font-size="${size}" font-weight="600" fill="${textColor}">${esc(l)}</text>`).join('')}
      <text x="${cx}" y="${y + h - 10}" text-anchor="middle" font-family="Inter,Arial" font-size="7" font-weight="600" letter-spacing=".4" fill="${textColor}" opacity=".85">${esc(m.form.toUpperCase())} · ${esc(m.pack)}</text>`;
  }

  const shadow = (id) => `<radialGradient id="sh${id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`;
  const ground = (id, rx = 60) => `<ellipse cx="100" cy="183" rx="${rx}" ry="8" fill="url(#sh${id})"/>`;
  const shine = (x, y, h) => `<rect x="${x}" y="${y}" width="7" height="${h}" rx="3.5" fill="#fff" opacity=".28"/>`;

  // Jar: churna, avaleha, ghrita
  function jar(m, [, c, d], id) {
    return `<defs>${shadow(id)}
        <linearGradient id="b${id}" x1="0" x2="1"><stop offset="0" stop-color="#f4efe4"/><stop offset=".45" stop-color="#fffdf8"/><stop offset="1" stop-color="#e6dfcf"/></linearGradient>
        <linearGradient id="l${id}" x1="0" x2="1"><stop offset="0" stop-color="${d}"/><stop offset=".5" stop-color="${c}"/><stop offset="1" stop-color="${d}"/></linearGradient></defs>
      ${ground(id, 64)}
      <rect x="44" y="62" width="112" height="120" rx="20" fill="url(#b${id})" stroke="#d9d0bc" stroke-width="1"/>
      <rect x="50" y="38" width="100" height="28" rx="7" fill="url(#l${id})"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => `<rect x="${56 + i * 8}" y="41" width="2" height="22" fill="#000" opacity=".1"/>`).join('')}
      ${label(m, 100, 86, 108, 76, c)}
      ${shine(52, 70, 104)}`;
  }

  // Amber glass bottle: arishta, kashayam
  function bottle(m, [, c, d], id) {
    return `<defs>${shadow(id)}
        <linearGradient id="g${id}" x1="0" x2="1"><stop offset="0" stop-color="#5a2e0c"/><stop offset=".4" stop-color="#9a5a1f"/><stop offset=".7" stop-color="#7a4314"/><stop offset="1" stop-color="#4a250a"/></linearGradient>
        <linearGradient id="k${id}" x1="0" x2="1"><stop offset="0" stop-color="#2a2a2a"/><stop offset=".5" stop-color="#555"/><stop offset="1" stop-color="#222"/></linearGradient></defs>
      ${ground(id, 46)}
      <rect x="82" y="14" width="36" height="22" rx="4" fill="url(#k${id})"/>
      <path d="M86 36h28v14c0 6 26 12 26 30v94a10 10 0 0 1-10 10H70a10 10 0 0 1-10-10V80c0-18 26-24 26-30z" fill="url(#g${id})"/>
      ${label(m, 100, 92, 80, 76, '#fbf6ea', d, 11.5)}
      <rect x="60" y="92" width="80" height="6" fill="${c}"/><rect x="60" y="162" width="80" height="6" fill="${c}"/>
      ${shine(66, 82, 92)}`;
  }

  // Tall clear oil bottle: taila
  function oil(m, [, c, d], id) {
    return `<defs>${shadow(id)}
        <linearGradient id="o${id}" x1="0" x2="1"><stop offset="0" stop-color="#b9821f"/><stop offset=".45" stop-color="#e8b84e"/><stop offset="1" stop-color="#a87418"/></linearGradient>
        <linearGradient id="l${id}" x1="0" x2="1"><stop offset="0" stop-color="${d}"/><stop offset=".5" stop-color="${c}"/><stop offset="1" stop-color="${d}"/></linearGradient></defs>
      ${ground(id, 40)}
      <rect x="84" y="10" width="32" height="12" rx="3" fill="url(#l${id})"/>
      <rect x="80" y="20" width="40" height="18" rx="4" fill="url(#l${id})"/>
      <path d="M86 38h28v6c0 4 18 8 18 22v110a8 8 0 0 1-8 8H76a8 8 0 0 1-8-8V66c0-14 18-18 18-22z" fill="url(#o${id})" stroke="#9b6c16" stroke-width=".8"/>
      ${label(m, 100, 84, 64, 82, c, '#fff', 10.5)}
      ${shine(73, 70, 104)}`;
  }

  // White pill bottle: vati, capsule
  function pills(m, [, c, d], id) {
    return `<defs>${shadow(id)}
        <linearGradient id="w${id}" x1="0" x2="1"><stop offset="0" stop-color="#ebe7df"/><stop offset=".4" stop-color="#ffffff"/><stop offset="1" stop-color="#ddd7cb"/></linearGradient>
        <linearGradient id="l${id}" x1="0" x2="1"><stop offset="0" stop-color="${d}"/><stop offset=".5" stop-color="${c}"/><stop offset="1" stop-color="${d}"/></linearGradient></defs>
      ${ground(id, 54)}
      <rect x="58" y="30" width="84" height="30" rx="6" fill="url(#l${id})"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<rect x="${63 + i * 8}" y="33" width="2.4" height="24" fill="#000" opacity=".12"/>`).join('')}
      <rect x="62" y="58" width="76" height="8" fill="#e4dfd4"/>
      <rect x="52" y="64" width="96" height="118" rx="14" fill="url(#w${id})" stroke="#d6d0c3" stroke-width="1"/>
      ${label(m, 100, 86, 96, 78, c, '#fff', 12)}
      ${shine(58, 72, 102)}`;
  }

  // Small amber dropper bottle: extracts
  function dropper(m, [, c, d], id) {
    return `<defs>${shadow(id)}
        <linearGradient id="g${id}" x1="0" x2="1"><stop offset="0" stop-color="#5a2e0c"/><stop offset=".4" stop-color="#9a5a1f"/><stop offset="1" stop-color="#4a250a"/></linearGradient></defs>
      ${ground(id, 42)}
      <path d="M90 12c0-6 20-6 20 0v30H90z" fill="#2b2b2b"/>
      <rect x="84" y="40" width="32" height="20" rx="3" fill="${c}"/>
      <rect x="62" y="60" width="76" height="122" rx="12" fill="url(#g${id})"/>
      ${label(m, 100, 92, 76, 72, '#fbf6ea', d, 11.5)}
      ${shine(68, 70, 100)}`;
  }

  const BY_FORM = { Churna: jar, Avaleha: jar, Ghrita: jar, Vati: pills, Capsule: pills, Arishta: bottle, Kashayam: bottle, Taila: oil, Extract: dropper };

  window.ART = {
    palette: pal,
    /** Full packshot. */
    svg(m) {
      const id = ++uid;
      return `<svg viewBox="0 0 200 200" role="img" aria-label="${esc(m.name)} ${esc(m.pack)}">${(BY_FORM[m.form] || jar)(m, pal(m.category), id)}</svg>`;
    },
    bg(m) { return pal(m.category)[0]; },
    color(cat) { return pal(cat)[1]; },
  };
})();
