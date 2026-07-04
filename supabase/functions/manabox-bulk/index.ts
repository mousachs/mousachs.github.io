declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => unknown;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ManaBoxCard = {
  collectorNumber?: string;
  name?: string;
  quantity?: number;
  setId?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const url = normalizeManaBoxDeckUrl(body?.url);
    if (!url) {
      return jsonResponse(
        { error: "Indica una URL pública válida de ManaBox." },
        400,
      );
    }

    const response = await fetch(url.href, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "MTG Trade ManaBox importer/1.0",
      },
    });
    if (!response.ok) {
      return jsonResponse(
        { error: `ManaBox respondió HTTP ${response.status}.` },
        502,
      );
    }

    const html = await response.text();
    const deckName = extractDeckName(html);
    const cards = extractManaBoxCards(html);
    if (!cards.length) {
      return jsonResponse(
        { error: "No se encontraron cartas en ese enlace de ManaBox." },
        422,
      );
    }

    const sourceText = cards.map(formatCardLine).join("\n");
    return jsonResponse({ deckName, sourceText, cards });
  } catch (error) {
    console.error(error);
    return jsonResponse(
      { error: "No se pudo leer el enlace de ManaBox." },
      500,
    );
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function normalizeManaBoxDeckUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLocaleLowerCase();
    if (host !== "manabox.app" && host !== "www.manabox.app") return null;

    const match = url.pathname.match(/^\/decks\/([A-Za-z0-9_-]+)\/?$/);
    if (!match) return null;

    return new URL(`https://manabox.app/decks/${match[1]}`);
  } catch {
    return null;
  }
}

function extractDeckName(html: string) {
  const title = html.match(/<title>(.*?)<\/title>/is)?.[1];
  return title ? decodeHtmlEntities(stripTags(title)).trim() : "";
}

function extractManaBoxCards(html: string) {
  const props = extractMainIslandProps(html) as {
    deck?: { cards?: unknown[] };
  } | null;
  const rawCards = Array.isArray(props?.deck?.cards) ? props.deck.cards : [];
  const byName = new Map<string, ManaBoxCard>();

  for (const rawCard of rawCards) {
    const card = rawCard as Record<string, unknown>;
    const name = cleanCardName(card.name);
    const quantity = Number(card.quantity ?? 0);
    if (!name || !Number.isFinite(quantity) || quantity <= 0) continue;

    const key = name.toLocaleLowerCase();
    const existing = byName.get(key);
    if (existing) {
      existing.quantity = (existing.quantity ?? 0) + quantity;
      continue;
    }

    byName.set(key, {
      collectorNumber: cleanCardName(card.collectorNumber),
      name,
      quantity,
      setId: cleanCardName(card.setId).toLocaleUpperCase(),
    });
  }

  return [...byName.values()].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" }),
  );
}

function extractMainIslandProps(html: string) {
  const islandMatches = html.matchAll(/<astro-island\b[^>]*>/gis);
  for (const match of islandMatches) {
    const tag = match[0];
    if (!tag.includes('component-export="Main"')) continue;

    const propsValue = tag.match(/\sprops="([^"]*)"/i)?.[1];
    if (!propsValue) continue;

    const decoded = decodeHtmlEntities(propsValue);
    const parsed = JSON.parse(decoded);
    return deserializeAstroValue(parsed);
  }
  return null;
}

function deserializeAstroValue(value: unknown): unknown {
  if (!Array.isArray(value)) {
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        deserializeAstroValue(entry),
      ]),
    );
  }

  if (value.length !== 2 || typeof value[0] !== "number") return value;

  const [type, data] = value;
  if (type === 0) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return data;
    return Object.fromEntries(
      Object.entries(data).map(([key, entry]) => [
        key,
        deserializeAstroValue(entry),
      ]),
    );
  }
  if (type === 1 && Array.isArray(data)) {
    return data.map(deserializeAstroValue);
  }
  return data;
}

function cleanCardName(value: unknown) {
  if (typeof value !== "string") return "";
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function formatCardLine(card: ManaBoxCard) {
  const details = [
    card.setId ? `[${card.setId}]` : "",
    card.collectorNumber ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return `${card.quantity} ${card.name}${details ? ` ${details}` : ""}`;
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, "");
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
