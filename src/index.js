// Shopy Trend : reçoit les commandes du site et les écrit dans Airtable.
// Le jeton Airtable est un secret Cloudflare nommé AIRTABLE_TOKEN (jamais dans GitHub).

const BASE_ID = "apppWdLSO36fhx1JG";
const TABLE_ID = "tblJBR83ejc1Pxnec";

const F = {
  client: "fldWr2e3F3EzZXSv3",
  adresse: "fldbuPQmzi4Vn6Mgs",
  produits: "flds0giuAVXEB8yD8",
  quantite: "fldQBD8IYr6p9GDQZ",
  prix: "fldvZO8ZH7tWK47jS",
  statut: "fld1VCtNgCnyu4x1M",
  paiement: "fldDhOBda1WC9nhxF",
  source: "fldn4e0MVxQNzZjMZ",
  date: "fldcdgkiX77xC38Xj",
  notes: "fldlFkbhbucIAqGKj",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" },
  });
}

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function handleOrder(request, env, url) {
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return json({ ok: false, error: "origine refusée" }, 403);
  if (!env.AIRTABLE_TOKEN) return json({ ok: false, error: "jeton manquant" }, 500);

  const raw = await request.text();
  if (raw.length > 8000) return json({ ok: false, error: "trop gros" }, 413);

  let body;
  try { body = JSON.parse(raw); } catch (e) { return json({ ok: false, error: "format" }, 400); }

  const name = clean(body.name, 80);
  const address = clean(body.address, 250);
  if (!name || !address || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
    return json({ ok: false, error: "commande incomplète" }, 400);
  }

  const lines = [];
  let total = 0;
  let count = 0;
  for (const it of body.items) {
    const itemName = clean(it && it.name, 60);
    const option = clean(it && it.option, 60);
    const qty = Number(it && it.qty);
    const price = Number(it && it.price);
    if (!itemName || !Number.isInteger(qty) || qty < 1 || qty > 20 || !(price >= 0 && price <= 500)) {
      return json({ ok: false, error: "article invalide" }, 400);
    }
    total += qty * price;
    count += qty;
    lines.push(qty + " x " + itemName + (option ? " (" + option + ")" : "") + " : " + qty * price + " $");
  }
  total = Math.round(total * 100) / 100;

  // Date du jour à Kinshasa (UTC+1)
  const today = new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 10);

  const res = await fetch("https://api.airtable.com/v0/" + BASE_ID + "/" + TABLE_ID, {
    method: "POST",
    headers: { Authorization: "Bearer " + env.AIRTABLE_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({
      typecast: true,
      records: [{
        fields: {
          [F.client]: name,
          [F.adresse]: address,
          [F.produits]: lines.join("\n"),
          [F.quantite]: 1,
          [F.prix]: total,
          [F.statut]: "Nouvelle",
          [F.paiement]: "Non payé",
          [F.source]: "WhatsApp",
          [F.date]: today,
          [F.notes]: "Commande du site. " + count + " article(s). Total : " + total + " $.",
        },
      }],
    }),
  });

  if (!res.ok) return json({ ok: false, error: "Airtable " + res.status }, 502);
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/order") {
      if (request.method !== "POST") return json({ ok: false, error: "méthode" }, 405);
      return handleOrder(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
};
