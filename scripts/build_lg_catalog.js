const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const seedPath = path.join(projectRoot, "config", "lg_catalog_seed_urls.txt");
const outPath = path.join(projectRoot, "public", "data", "lg_catalog.json");
const jsOutPath = path.join(projectRoot, "public", "data", "lg_catalog.js");

const MAX_DETAIL_PAGES = Number(process.env.LG_CATALOG_MAX_DETAIL || 350);
const MAX_SCAN_PAGES = Number(process.env.LG_CATALOG_MAX_SCAN || 140);
const REQUEST_DELAY_MS = Number(process.env.LG_CATALOG_DELAY_MS || 180);
const API_BASE = "https://apiv2.lge.co.kr/plpsvc";

main().catch(error => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const seeds = readSeedUrls();
  if (!seeds.length) throw new Error(`No seed URLs found: ${seedPath}`);

  console.log(`LG catalog seeds: ${seeds.length}`);
  const discovered = new Map();

  for (const seed of seeds) {
    try {
      const category = await fetchPlpCategory(seed);
      if (!category?.categoryId) continue;
      console.log(`PLP category: ${category.categoryName || seed} (${category.categoryId})`);
      for (const item of await fetchPlpModels(category)) {
        const key = item.model || item.url;
        if (!discovered.has(key)) discovered.set(key, item);
      }
    } catch (error) {
      console.warn(`  PLP skipped: ${seed} - ${error.message}`);
    }
    await delay(REQUEST_DELAY_MS);
  }

  const queue = [...seeds];
  const scanned = new Set();

  while (queue.length && scanned.size < MAX_SCAN_PAGES && discovered.size < 50) {
    const url = queue.shift();
    if (!url || scanned.has(url)) continue;
    scanned.add(url);
    console.log(`Scanning seed: ${url}`);
    let html = "";
    try {
      html = await fetchText(url);
    } catch (error) {
      console.warn(`  scan skipped: ${error.message}`);
      continue;
    }
    for (const item of extractProductsFromHtml(html, url)) {
      const key = item.model || item.url;
      if (!discovered.has(key)) discovered.set(key, item);
    }
    for (const link of extractCatalogLinks(html, url)) {
      if (!scanned.has(link) && queue.length < MAX_SCAN_PAGES * 4) queue.push(link);
    }
    await delay(REQUEST_DELAY_MS);
  }

  const candidates = [...discovered.values()];
  const detailCandidates = candidates.slice(0, MAX_DETAIL_PAGES);
  console.log(`Scanned pages: ${scanned.size}`);
  console.log(`Products to save: ${candidates.length}`);
  console.log(`Detail pages to enrich: ${detailCandidates.length}`);

  const products = candidates.map(normalizeProduct);
  for (const [index, candidate] of detailCandidates.entries()) {
    console.log(`[${index + 1}/${detailCandidates.length}] ${candidate.model || candidate.url}`);
    try {
      const detail = await fetchProductDetail(candidate);
      products.push(detail);
    } catch (error) {
      products.push(normalizeProduct(candidate));
      console.warn(`  detail skipped: ${error.message}`);
    }
    await delay(REQUEST_DELAY_MS);
  }

  const deduped = dedupeProducts(products);
  const payload = {
    generatedAt: new Date().toISOString(),
    source: "LG전자 공식 홈페이지",
    count: deduped.length,
    detailEnhancedCount: detailCandidates.length,
    products: deduped,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(jsOutPath, `window.LG_CATALOG = ${JSON.stringify(payload, null, 2)};\n`, "utf8");
  console.log(`LG catalog written: ${outPath}`);
  console.log(`LG catalog JS written: ${jsOutPath}`);
  console.log(`Products: ${deduped.length}`);
}

async function fetchPlpCategory(seedUrl) {
  const parsed = new URL(seedUrl);
  const pageUrl = `${parsed.pathname}${parsed.search}` || "/";
  const url = `${API_BASE}/ajax/v1/plp/category?pageUrl=${encodeURIComponent(pageUrl)}`;
  const payload = await fetchJson(url);
  return payload.data;
}

async function fetchPlpModels(category) {
  const products = [];
  const first = await fetchPlpModelPage(category, 1);
  products.push(...plpItemsToProducts(first.modelList || [], category));

  const total = Number(first.totalModelCnt || products.length || 0);
  const totalPages = Math.ceil(total / 30);
  console.log(`  PLP models: ${total.toLocaleString()} (${totalPages} pages)`);

  for (let page = 2; page <= totalPages; page += 1) {
    const data = await fetchPlpModelPage(category, page);
    products.push(...plpItemsToProducts(data.modelList || [], category));
    await delay(REQUEST_DELAY_MS);
  }
  return products;
}

async function fetchPlpModelPage(category, page) {
  const url = `${API_BASE}/ajax/v1/plp/category/${encodeURIComponent(category.categoryId)}/model`;
  const payload = await fetchJson(url, {
    method: "POST",
    body: JSON.stringify({
      page,
      b2cYn: category.b2cYn || "Y",
      ...(category.subCategoryId ? { subCategoryId: category.subCategoryId } : {}),
    }),
  });
  return payload.data || {};
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "accept": "application/json",
      "content-type": "application/json;charset=UTF-8",
      "origin": "https://www.lge.co.kr",
      "referer": "https://www.lge.co.kr/",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      ...(options.headers || {}),
    },
    body: options.body,
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return await response.json();
}

function plpItemsToProducts(items, category) {
  return items.map(item => normalizeProduct({
    model: item.modelName || item.salesModelCode || item.sku,
    name: item.modelDisplayName || item.modelName,
    category: cleanText(item.categoryName || "")
      || category.categoryName
      || "LG전자 제품",
    image: absoluteImage(item.mediumImageAddr || item.largeImageAddr || item.smallImageAddr || "", "https://www.lge.co.kr/"),
    url: absoluteProductUrl(item.modelUrlPath || item.rentalModelUrlPath || ""),
    summary: plpSummary(item),
    specs: plpSpecs(item),
  })).filter(product => isValidProductModel(product.model));
}

function plpSpecs(item) {
  const specs = {};
  if (item.keywds) specs["대표 키워드"] = cleanText(String(item.keywds).replace(/\^/g, ", "));
  if (item.modelReleaseDate) specs["출시일"] = String(item.modelReleaseDate).slice(0, 10);
  for (const attr of item.productAttrKeywds || []) {
    const name = cleanText(attr.attrNm || "");
    const value = cleanText(String(attr.keywds || "").replace(/\^/g, ", "));
    if (isUsefulSpec(name, value) && !specs[name]) specs[name] = value;
  }
  return specs;
}

function plpSummary(item) {
  const parts = [
    item.defaultCategoryName || item.categoryName,
    item.subCategoryName,
    item.keywds ? String(item.keywds).replace(/\^/g, ", ") : "",
  ].filter(Boolean);
  return compactJoin(parts, " · ");
}

function absoluteProductUrl(pathname) {
  if (!pathname) return "";
  return new URL(pathname, "https://www.lge.co.kr/").href;
}

function compactJoin(items, separator) {
  return items.map(item => cleanText(item || "")).filter(Boolean).join(separator);
}

function readSeedUrls() {
  if (!fs.existsSync(seedPath)) return ["https://www.lge.co.kr/home"];
  return fs.readFileSync(seedPath, "utf8")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return await response.text();
}

function extractProductsFromHtml(html, pageUrl) {
  const products = [];
  const base = new URL(pageUrl);
  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];

  for (const match of anchors) {
    const href = absolutize(match[1], base);
    if (!href || !href.includes("lge.co.kr")) continue;

    const text = cleanText(match[2]);
    const model = extractModel(text) || extractModelFromProductUrl(href);
    if (!model) continue;

    products.push({
      model,
      name: cleanProductName(text, model),
      category: categoryFromUrl(href),
      url: href,
      image: extractNearbyImage(match[0], html),
      summary: "",
      specs: {},
    });
  }

  const textMatches = [...cleanText(html).matchAll(/(.{0,70}?모델명\s+([A-Z0-9][A-Z0-9\-]{3,25})(?:\.AKOR)?[^。.\n]{0,90})/gi)];
  for (const match of textMatches) {
    const model = normalizeModel(match[2]);
    if (!isValidProductModel(model)) continue;
    products.push({
      model,
      name: cleanProductName(match[1], model),
      category: categoryFromUrl(pageUrl),
      url: pageUrl,
      image: "",
      summary: "",
      specs: {},
    });
  }

  return products;
}

function extractCatalogLinks(html, pageUrl) {
  const base = new URL(pageUrl);
  const links = new Set();
  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)];
  for (const match of anchors) {
    const href = absolutize(match[1], base);
    if (!href || !href.startsWith("https://www.lge.co.kr/")) continue;
    const pathname = new URL(href).pathname.toLowerCase();
    if (isBlockedCatalogPath(pathname)) continue;
    if (isLikelyCatalogPath(pathname)) links.add(href);
  }
  return [...links];
}

function isBlockedCatalogPath(pathname) {
  return [
    "/support", "/event", "/story", "/benefits", "/notice", "/news",
    "/lg-life", "/best-ranking", "/my-page", "/sitemap"
  ].some(key => pathname.includes(key));
}

function isLikelyCatalogPath(pathname) {
  const keys = [
    "air-condition", "tvs", "refrigerator", "washing", "dryer", "dishwasher",
    "vacuum", "water", "notebook", "monitor", "styler", "kimchi", "projector",
    "soundbar", "audio", "oven", "microwave", "air-purifier", "dehumidifier",
    "care-solutions"
  ];
  return keys.some(key => pathname.includes(key));
}

async function fetchProductDetail(candidate) {
  const html = await fetchText(candidate.url);
  const detailHtml = await fetchOptional(candidate.url + (candidate.url.includes("?") ? "&" : "?") + "itemView=y");
  const merged = `${html}\n${detailHtml}`;
  const text = cleanText(merged);
  const title = cleanProductName(
    cleanText(getMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i))
    || decode(getMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i)).split("|")[0],
    candidate.model
  );
  const image = pickBestImage(collectImageCandidates(merged, candidate.image), candidate.url);
  const additional = parseAdditionalProperties(merged);
  const specs = { ...(candidate.specs || {}), ...summarizeSpecs(additional, text) };

  return normalizeProduct({
    ...candidate,
    name: title || candidate.name,
    image,
    category: candidate.category || categoryFromUrl(candidate.url),
    summary: summarizeText(text),
    specs,
  });
}

async function fetchOptional(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0",
        "x-requested-with": "XMLHttpRequest",
      },
    });
    return response.ok ? await response.text() : "";
  } catch {
    return "";
  }
}

function parseAdditionalProperties(html) {
  const found = [];
  const scripts = [...html.matchAll(/<script type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  for (const script of scripts) {
    if (!script.includes("additionalProperty")) continue;
    try {
      const parsed = JSON.parse(decode(script.trim()));
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) collectAdditional(node, found);
    } catch {
      // Ignore invalid structured data.
    }
  }
  return found;
}

function collectAdditional(node, found) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectAdditional(item, found);
    return;
  }
  if (Array.isArray(node.additionalProperty)) {
    for (const prop of node.additionalProperty) {
      const name = prop.name || prop.propertyID || "";
      const value = prop.value || "";
      if (name && value) found.push([cleanText(name), cleanText(value)]);
    }
  }
  for (const value of Object.values(node)) collectAdditional(value, found);
}

function summarizeSpecs(additional, text) {
  const specs = {};
  const wanted = [
    "에너지", "용량", "크기", "사이즈", "화면", "냉방", "소비전력",
    "색상", "무게", "해상도", "등급", "인치", "리터", "kg"
  ];
  for (const [name, value] of additional) {
    if (Object.keys(specs).length >= 8) break;
    if (wanted.some(key => `${name} ${value}`.includes(key)) && isUsefulSpec(name, value)) specs[name] = value;
  }
  if (!Object.keys(specs).length) {
    const modelLine = getMatch(text, /(모델명\s+[A-Z0-9][A-Z0-9\-]{3,25})/i);
    if (modelLine) specs["모델명"] = modelLine.replace(/^모델명\s*/i, "");
  }
  return specs;
}

function isUsefulSpec(name, value) {
  const key = cleanText(name);
  const val = cleanText(value);
  if (!key || !val) return false;
  if (key.includes("판매가") || key.includes("가격")) return false;
  if (key === "리뷰" || key === "배송/설치") return false;
  if (["크기", "무게", "패널", "디스플레이", "색상"].includes(key) && !hasMeasurableValue(val)) return false;
  if (/[,.]$/.test(val)) return false;
  if (/스탠드 제외|설치되어 있으며|은 모니터|눈부심 없는|인증 내용|기준 ④/.test(val)) return false;
  return true;
}

function hasMeasurableValue(value) {
  return /\d/.test(value) && /(cm|mm|kg|g|인치|inch|OLED|QNED|LCD|LED|IPS|VA|나노셀|올레드)/i.test(value);
}

function extractSpecsFromText(text) {
  const specs = [];
  const labels = [
    "화면 사이즈", "해상도", "디스플레이", "냉방면적", "냉방 능력", "에너지소비효율등급",
    "에너지 등급", "용량", "전체 용량", "세탁 용량", "건조 용량", "정격전압", "소비전력",
    "크기", "제품 크기", "무게", "색상", "패널", "모터", "필터", "소음", "연간 에너지"
  ];
  const clean = cleanText(text);
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`${escaped}\\s*[:：]?\\s*([^|]{2,55}?)(?=\\s{2,}|${labels.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}|$)`, "i");
    const match = clean.match(regex);
    if (match) {
      const value = match[1].replace(/자세히보기.*$/i, "").trim();
      if (value && !value.includes("제품 공유하기")) specs.push([label, value]);
    }
  }
  return specs;
}

function dedupeProducts(products) {
  const map = new Map();
  for (const product of products.map(normalizeProduct)) {
    if (!product.model) continue;
    if (!isValidProductModel(product.model)) continue;
    const existing = map.get(product.model);
    if (!existing) {
      map.set(product.model, product);
      continue;
    }
    map.set(product.model, {
      ...existing,
      ...product,
      specs: { ...existing.specs, ...product.specs },
      image: existing.image || product.image,
      name: longer(existing.name, product.name),
      summary: longer(existing.summary, product.summary),
    });
  }
  return [...map.values()].sort((a, b) => a.model.localeCompare(b.model));
}

function normalizeProduct(product) {
  const model = normalizeModel(product.model);
  return {
    model,
    name: cleanText(product.name || product.model || ""),
    category: cleanText(product.category || "LG전자 제품"),
    image: product.image || "",
    url: product.url || "",
    summary: cleanSummaryText(product.summary || ""),
    specs: sanitizeSpecs(product.specs || {}),
  };
}

function cleanSummaryText(value) {
  return cleanText(value)
    .replace(/현재 별점\s*[\s\S]*?(?=비교하기|LGE\.COM|구성품|옵션 선택|$)/g, "")
    .replace(/정상가[\s\S]*$/g, "")
    .replace(/판매가[\s\S]*$/g, "")
    .replace(/회원할인가[\s\S]*$/g, "")
    .trim();
}

function sanitizeSpecs(specs) {
  const cleaned = {};
  for (const [name, value] of Object.entries(specs || {})) {
    if (isUsefulSpec(name, value)) cleaned[cleanText(name)] = cleanText(value);
  }
  return cleaned;
}

function extractModel(value) {
  const text = String(value || "").toUpperCase();
  const explicit = text.match(/모델명\s+([A-Z0-9][A-Z0-9\-]{3,25})(?:\.AKOR)?/i);
  if (explicit) {
    const model = normalizeModel(explicit[1]);
    return isValidProductModel(model) ? model : "";
  }
  const generic = text.match(/\b[A-Z]{1,5}[0-9][A-Z0-9\-]{3,22}(?:\.AKOR)?\b/);
  if (!generic) return "";
  const model = normalizeModel(generic[0]);
  return isValidProductModel(model) ? model : "";
}

function extractModelFromProductUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "";
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return "";
  const slug = segments[segments.length - 1];
  if (!slug || !/\d/.test(slug)) return "";
  if (isBlockedSlug(slug)) return "";
  if (/^ct\d+$/i.test(slug) || /^md\d+$/i.test(slug)) return "";
  const cleaned = slug
    .replace(/-(?:stand|wall)$/i, "")
    .replace(/-akor\d*$/i, "")
    .toUpperCase();
  const model = normalizeModel(cleaned);
  return isValidProductModel(model) ? model : "";
}

function normalizeModel(value) {
  return String(value || "").toUpperCase().replace(/\.AKOR$/, "").replace(/[^A-Z0-9\-]/g, "");
}

function isValidProductModel(model) {
  const value = normalizeModel(model);
  if (!value) return false;
  if (isBlockedSlug(value)) return false;
  if (/^CT\d+$/i.test(value)) return false;
  if (/^MD\d+$/i.test(value)) return false;
  if (/^SC\d+$/i.test(value) && value.length > 10) return false;
  if (/^\d+$/.test(value)) return false;
  if (value.length < 5 || value.length > 24) return false;
  if (!/[A-Z]/.test(value) || !/\d/.test(value)) return false;
  return true;
}

function isBlockedSlug(value) {
  const slug = String(value || "").toLowerCase();
  return /^(detail|notice|event|pkg|mc|nv|pe|ev|windows|lglife|blog|story|course|guide|localmock)/i.test(slug)
    || slug.includes("lglife")
    || slug.includes("windows")
    || slug.includes("blog")
    || slug.includes("notice")
    || slug.includes("event");
}

function cleanProductName(value, model) {
  let text = cleanText(value)
    .replace(/최대혜택가[\s\S]*$/i, "")
    .replace(/모델명\s+[A-Z0-9][A-Z0-9\-]{3,25}(?:\.AKOR)?/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!text || text.length < 4) text = model || "";
  return text.slice(0, 120);
}

function categoryFromUrl(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  const table = [
    ["air-condition", "에어컨/에어케어"],
    ["tvs", "TV/오디오"],
    ["refrigerator", "냉장고"],
    ["washing", "세탁기"],
    ["dryer", "건조기"],
    ["dishwasher", "식기세척기"],
    ["vacuum", "청소기"],
    ["water", "정수기"],
    ["notebook", "노트북"],
    ["monitor", "모니터"],
  ];
  const found = table.find(([key]) => pathname.includes(key));
  return found ? found[1] : "LG전자 제품";
}

function extractNearbyImage(anchorHtml, html) {
  const source = anchorHtml.length > 20 ? anchorHtml : html;
  const image = getMatch(source, /<img[^>]+(?:src|data-src|data-original)=["']([^"']+)["']/i);
  return image || "";
}

function collectImageCandidates(html, fallback) {
  const candidates = [];
  if (fallback) candidates.push(fallback);
  const patterns = [
    /property=["']og:image["']\s+content=["']([^"']+)["']/gi,
    /content=["']([^"']+)["']\s+property=["']og:image["']/gi,
    /<img[^>]+(?:src|data-src|data-original)=["']([^"']+)["']/gi,
    /["']([^"']*\/kr\/images\/[^"']+\.(?:jpg|png|webp))["']/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) candidates.push(decode(match[1]));
  }
  return [...new Set(candidates)];
}

function pickBestImage(candidates, pageUrl) {
  const scored = candidates
    .filter(Boolean)
    .map(image => absoluteImage(image, pageUrl))
    .filter(image => /^https?:\/\//.test(image))
    .map(image => ({ image, score: imageScore(image) }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.image || "";
}

function imageScore(image) {
  const lower = image.toLowerCase();
  let score = 0;
  if (lower.includes("/gallery/")) score += 80;
  if (lower.includes("medium01") || lower.includes("large01")) score += 40;
  if (lower.includes("medium") || lower.includes("large")) score += 20;
  if (lower.includes("thumbnail")) score += 8;
  if (lower.includes("banner") || lower.includes("kv") || lower.includes("bnr")) score -= 50;
  if (lower.includes("logo") || lower.includes("icon")) score -= 80;
  return score;
}

function absoluteImage(image, pageUrl) {
  if (!image) return "";
  image = decode(image).replace(/&amp;/g, "&");
  try {
    return new URL(image, pageUrl).href;
  } catch {
    return image;
  }
}

function absolutize(href, base) {
  try {
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return "";
    return new URL(href, base).href.split("#")[0];
  } catch {
    return "";
  }
}

function summarizeText(text) {
  const cleaned = cleanText(text);
  const modelIndex = cleaned.indexOf("모델명");
  const slice = modelIndex >= 0 ? cleaned.slice(Math.max(0, modelIndex - 80), modelIndex + 180) : cleaned.slice(0, 220);
  return slice.trim();
}

function cleanText(value) {
  return decode(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function decode(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#40;/g, "(")
    .replace(/&#41;/g, ")")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function getMatch(source, regex) {
  const match = String(source || "").match(regex);
  return match ? match[1] : "";
}

function longer(a, b) {
  return String(b || "").length > String(a || "").length ? b : a;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
