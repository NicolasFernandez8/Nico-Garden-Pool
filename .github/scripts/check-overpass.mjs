const q = `[out:json][timeout:240];
area["boundary"="administrative"]["admin_level"="6"]["name"~"Alicante|Alacant",i]->.zona;
rel(area.zona)["boundary"="administrative"]["admin_level"="8"];
map_to_area->.locs;
foreach.locs->.l(
  .l out tags;
  nwr(area.l)["tourism"~"^(hotel|hostel|guest_house|motel|apartment|chalet)$"];
  out center tags;
);`;
for (const s of ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
  try {
    const r = await fetch(s, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'nico-garden-pool-check' } });
    console.log(s, r.status);
    if (!r.ok) continue;
    const j = await r.json();
    let loc = '', locs = 0; const por = {}; let tot = 0, tel = 0, mail = 0, web = 0, nom = 0;
    for (const e of j.elements) {
      if (e.type === 'area') { loc = e.tags?.name; locs++; continue; }
      tot++; const t = e.tags || {}; if (!t.name) continue; nom++;
      por[loc] = (por[loc] || 0) + 1;
      if (t.phone || t['contact:phone']) tel++; if (t.email || t['contact:email']) mail++; if (t.website || t['contact:website']) web++;
    }
    console.log({ localidades: locs, elementos: tot, conNombre: nom, conTelefono: tel, conEmail: mail, conWeb: web });
    console.log(Object.entries(por).sort((a, b) => b[1] - a[1]).slice(0, 30));
    break;
  } catch (e) { console.log(s, 'ERR', e.message); }
}
