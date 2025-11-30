// Careers24 jobs scraper - CheerioCrawler implementation
// Stealthy, production-grade, with clean description_html / description_text,
// sectors, single job_id column, and clean company_description.

import { Actor, log } from 'apify';
import { CheerioCrawler, Dataset, sleep } from 'crawlee';
import { load as cheerioLoad } from 'cheerio';

// ───────────────────────────────────────────────────────────────
// Stealth browser profiles (simulated latest desktop browsers - Nov 2025)
// ───────────────────────────────────────────────────────────────

const BROWSER_PROFILES = [
    {
        // Chrome 131 on Windows 11
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        secChUa: '"Google Chrome";v="131", "Not=A?Brand";v="99", "Chromium";v="131"',
        secChUaMobile: '?0',
        secChUaPlatform: '"Windows"',
    },
    {
        // Chrome 131 on macOS 14
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        secChUa: '"Google Chrome";v="131", "Not=A?Brand";v="99", "Chromium";v="131"',
        secChUaMobile: '?0',
        secChUaPlatform: '"macOS"',
    },
    {
        // Edge 130 on Windows 11
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
        secChUa: '"Microsoft Edge";v="130", "Chromium";v="130", "Not=A?Brand";v="99"',
        secChUaMobile: '?0',
        secChUaPlatform: '"Windows"',
    },
    {
        // Firefox 131 on Linux
        ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
        secChUa: '"Firefox";v="131", "Not=A?Brand";v="99"',
        secChUaMobile: '?0',
        secChUaPlatform: '"Linux"',
    },
];

const pickBrowserProfile = () =>
    BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomDelay = async (minMs, maxMs) => {
    const delay = randomInt(minMs, maxMs);
    await sleep(delay);
};

const toAbs = (href, base = 'https://www.careers24.com') => {
    try {
        return new URL(href, base).href;
    } catch {
        return null;
    }
};

const normalizeText = (str) => {
    if (!str && str !== 0) return null;
    return String(str).replace(/\s+/g, ' ').trim() || null;
};

const basicCleanText = (htmlOrText) => {
    if (!htmlOrText) return '';
    const $ = cheerioLoad(htmlOrText);
    $('script, style, noscript, iframe').remove();
    return $.root().text().replace(/\s+/g, ' ').trim();
};

// Serialize a subtree into HTML containing only "text-related tags":
// h1–h6, p, ul, ol, li, strong, em, b, i
// with NO attributes (no classes / ids / style).
const ALLOWED_TAGS = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'ul', 'ol', 'li',
    'strong', 'em', 'b', 'i',
]);

const sanitizeSubtreeToHtml = ($local, rootNode) => {
    const walk = (node) => {
        let out = '';

        $local(node)
            .contents()
            .each((_, child) => {
                if (child.type === 'text') {
                    out += child.data;
                } else if (child.type === 'tag') {
                    const tag = child.name.toLowerCase();
                    if (ALLOWED_TAGS.has(tag)) {
                        const inner = walk(child);
                        out += `<${tag}>${inner}</${tag}>`;
                    } else {
                        // Skip non-allowed tag but still walk its children
                        out += walk(child);
                    }
                }
            });

        return out;
    };

    return walk(rootNode) || '';
};

// Given raw HTML of a "content root",
// 1) removes junk (share, meta chips, similar jobs, ads, social).
// 2) serializes only text-related tags (no attributes).
// 3) returns { html, text }.
const extractSanitizedContent = (rootHtml) => {
    if (!rootHtml) return { html: null, text: null };

    const $local = cheerioLoad(`<root>${rootHtml}</root>`);
    const root = $local('root').first();

    // Remove obvious junk
    root.find(
        'script, style, noscript, iframe, form, button,' +
            '.vacancy-detail-head, .icon-list, .small-text.icon-list,' +
            '.social-media, .social-media-desktop, .social-media-mobile,' +
            '.share, .share-buttons, .breadcrumbs, .breadcrumb,' +
            '.ad-container, .advert, .advertisement, .adsbygoogle,' +
            '#adcontainer1, [id^="div-gpt-ad"], .job-actions, .job-header-tools'
    ).remove();

    // Remove "Share This Vacancy" modal titles/containers
    root.find('h4').each((_, el) => {
        const t = $local(el).text().trim();
        if (/^Share This Vacancy$/i.test(t)) {
            $local(el).closest('div, section, header').remove();
        }
    });

    // Remove "Similar Jobs" / "More Jobs" sections
    root.find('h1, h2, h3').each((_, el) => {
        const t = $local(el).text().trim();
        if (/^Similar Jobs$/i.test(t) || /^More Jobs/i.test(t)) {
            const parent = $local(el).closest('section, div, article');
            if (parent.length) parent.remove();
            else $local(el).remove();
        }
    });

    // Now serialize only allowed tags without attributes
    const html = sanitizeSubtreeToHtml($local, root[0]);
    const text = basicCleanText(html);

    return {
        html: html || null,
        text: text || null,
    };
};

const buildStartUrl = (kw, loc, sect, remOnly, minSal) => {
    let u = new URL('https://www.careers24.com/jobs/');

    if (loc) {
        const locSlug = String(loc).toLowerCase().replace(/\s+/g, '-');
        u = new URL(`https://www.careers24.com/jobs/lc-${locSlug}/`);
    }

    if (remOnly) {
        u.pathname += 'rmt-only/';
    } else {
        u.pathname += 'rmt-incl/';
    }

    u.searchParams.set('sort', 'dateposted');
    if (kw) u.searchParams.set('q', String(kw).trim());
    if (sect) u.searchParams.set('sectors', String(sect).trim());
    if (minSal) u.searchParams.set('minsalary', String(minSal).trim());

    return u.href;
};

function extractFromJsonLd($) {
    const scripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
        try {
            const parsed = JSON.parse($(scripts[i]).html() || '');
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            for (const e of arr) {
                if (!e) continue;
                const t = e['@type'] || e.type;
                if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) {
                    return {
                        title: e.title || e.name || null,
                        company: e.hiringOrganization?.name || null,
                        date_posted: e.datePosted || null,
                        valid_through: e.validThrough || null,
                        description_html: e.description || null,
                        location:
                            (e.jobLocation &&
                                e.jobLocation.address &&
                                (e.jobLocation.address.addressLocality ||
                                    e.jobLocation.address.addressRegion)) ||
                            null,
                        salary: e.baseSalary
                            ? typeof e.baseSalary === 'string'
                                ? e.baseSalary
                                : e.baseSalary.value?.value ||
                                  e.baseSalary.value ||
                                  null
                            : null,
                        employment_type: e.employmentType || null,
                    };
                }
            }
        } catch {
            // ignore JSON-LD errors
        }
    }
    return null;
}

function findJobLinks($, base) {
    const links = new Set();
    $('a[href*="/jobs/adverts/"]').each((_, a) => {
        const href = $(a).attr('href');
        if (!href) return;
        const abs = toAbs(href, base);
        if (abs && !abs.includes('/now-hiring/')) links.add(abs);
    });
    return [...links];
}

function findNextPage($, base, currentPage) {
    const nextPageNum = currentPage + 1;
    const nextBtn = $('a')
        .filter((_, el) => {
            const text = $(el).text().trim();
            return text === '>' || text === 'Next' || text === String(nextPageNum);
        })
        .first();

    const href = nextBtn.attr('href');
    if (href) return toAbs(href, base);

    const currentUrl = new URL(base);
    currentUrl.searchParams.set('page', String(nextPageNum));
    const candidate = currentUrl.href;
    if (candidate === base) return null;
    return candidate;
}

// Extract meta: Location / Salary / Job Type / Sectors / Job ID
function extractMetaFromSummary($) {
    const meta = {};
    const block = $('.job-summary, .job-details, .job-info, .job-summary-list, .job-meta').first();
    if (!block || !block.length) return meta;

    const rows = block.find('li, tr, .job-meta-row, .job-summary-item');

    rows.each((_, el) => {
        const $el = $(el);
        let text = $el.text().replace(/\s+/g, ' ').trim();
        if (!text) return;

        let label = '';
        let value = '';

        const parts = text.split(':');
        if (parts.length > 1) {
            label = parts[0].trim().toLowerCase();
            value = parts.slice(1).join(':').trim();
        } else {
            const strong = $el.find('strong, b, dt').first().text().trim();
            if (strong) {
                label = strong.replace(/:$/, '').trim().toLowerCase();
                const clone = $el.clone();
                clone.find('strong, b, dt').remove();
                value = clone.text().replace(/\s+/g, ' ').trim();
            }
        }

        if (!value) {
            value =
                $el
                    .find('span, .value, dd')
                    .last()
                    .text()
                    .replace(/\s+/g, ' ')
                    .trim() || value;
        }

        if (!label || !value) return;

        switch (label) {
            case 'location':
            case 'city':
                meta.location = value;
                break;
            case 'salary':
            case 'remuneration':
                meta.salary = value;
                break;
            case 'job type':
            case 'type':
            case 'employment type':
                meta.employment_type = value;
                break;
            case 'sectors':
            case 'sector':
            case 'industry':
            case 'industries':
            case 'category':
                meta.sectors = value;
                break;
            case 'reference':
            case 'ref':
            case 'ref.':
            case 'job ref':
            case 'job reference':
            case 'job id':
            case 'id':
                meta.job_id = value;
                break;
            default:
                break;
        }
    });

    return meta;
}

// Fallback sectors from inline scripts (job_sector targeting)
function extractSectorsFromScripts($) {
    let sector = null;
    $('script').each((_, el) => {
        const txt = $(el).html() || '';
        const m = txt.match(/job_sector'\s*,\s*\[\s*'([^']+)'/);
        if (m && m[1]) {
            sector = m[1];
            return false; // break
        }
    });
    return sector;
}

// Extract numeric job ID from URL like /jobs/adverts/2324757-service-ambassador-johannesburg/
function extractJobIdFromUrl(jobUrl) {
    try {
        const u = new URL(jobUrl);
        const parts = u.pathname.split('/').filter(Boolean);
        const advertsIndex = parts.indexOf('adverts');
        if (advertsIndex !== -1 && parts[advertsIndex + 1]) {
            const slug = parts[advertsIndex + 1]; // "2324757-service-ambassador-johannesburg"
            const match = slug.match(/\d+/);
            return match ? match[0] : null;
        }
        const match = u.pathname.match(/(\d{4,})/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

// ── Company description extraction ─────────────────────────────
// Rules:
// - Prefer .c24-vacancy-details-contents
// - Only accept if:
//     * length >= 80 chars AND
//     * EITHER contains companyName
//       OR contains no "careers24" / job-board CTAs.
// - Optional fallback: a heading "About {company}" where heading text includes companyName.
// - Otherwise return null (keep column empty).
const extractCompanyDescription = ($, companyNameRaw) => {
    const companyName = (companyNameRaw || '').trim();
    const companyLower = companyName.toLowerCase();
    const isCompanyMentioned = (text) =>
        companyLower && text.toLowerCase().includes(companyLower);

    const looksLikeGenericCareers24 = (text) => {
        const t = text.toLowerCase();
        if (t.length < 80) return true; // too short to be a proper profile

        const mentionsCareers24 = t.includes('careers24');
        const genericCtas = [
            'browse jobs',
            'search for jobs',
            'upload your cv',
            'post your cv',
            'post your resume',
            'get job alerts',
        ];
        if (genericCtas.some((p) => t.includes(p))) return true;

        // If it mentions Careers24 but not the company name, treat as generic
        if (mentionsCareers24 && (!companyLower || !t.includes(companyLower))) return true;

        return false;
    };

    // 1) Primary: dedicated company description container
    let root = $('.c24-vacancy-details-contents').first();
    if (root && root.length) {
        const { text } = extractSanitizedContent(root.html() || '');
        if (text) {
            const trimmed = text.trim();
            if (!looksLikeGenericCareers24(trimmed)) {
                // If a company name is known, prefer that it's mentioned
                if (!companyLower || isCompanyMentioned(trimmed) || trimmed.length > 150) {
                    return trimmed;
                }
            }
        }
    }

    // 2) Fallback: explicit "About {Company}" heading
    if (companyLower) {
        const aboutHeading = $('h1, h2, h3')
            .filter((_, el) => {
                const h = $(el).text().trim().toLowerCase();
                return h.startsWith('about') && h.includes(companyLower);
            })
            .first();

        if (aboutHeading && aboutHeading.length) {
            const container =
                aboutHeading.closest('section, div, article') || aboutHeading.parent();
            if (container && container.length) {
                const { text } = extractSanitizedContent(container.html() || '');
                if (text) {
                    const trimmed = text.trim();
                    if (!looksLikeGenericCareers24(trimmed) && isCompanyMentioned(trimmed)) {
                        return trimmed;
                    }
                }
            }
        }
    }

    // If nothing passes the checks, keep it empty
    return null;
};

// ───────────────────────────────────────────────────────────────
// MAIN (Actor.main)
// ───────────────────────────────────────────────────────────────

await Actor.main(async () => {
    const input = (await Actor.getInput()) || {};
    const {
        keyword = '',
        location = '',
        sector = '',
        results_wanted: RESULTS_WANTED_RAW = 100,
        max_pages: MAX_PAGES_RAW = 999,
        collectDetails = true,
        startUrl,
        startUrls,
        url,
        proxyConfiguration,
        remoteOnly = false,
        minSalary = '',
        maxConcurrency: INPUT_MAX_CONCURRENCY,
        stealthDelays = true,
    } = input;

    const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW)
        ? Math.max(1, +RESULTS_WANTED_RAW)
        : Number.MAX_SAFE_INTEGER;
    const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW)
        ? Math.max(1, +MAX_PAGES_RAW)
        : 999;

    const MAX_CONCURRENCY = Number.isFinite(+INPUT_MAX_CONCURRENCY)
        ? Math.max(1, +INPUT_MAX_CONCURRENCY)
        : 5; // lower for stealth, still efficient

    const initial = [];
    if (Array.isArray(startUrls) && startUrls.length) initial.push(...startUrls);
    if (startUrl) initial.push(startUrl);
    if (url) initial.push(url);
    if (!initial.length) initial.push(buildStartUrl(keyword, location, sector, remoteOnly, minSalary));

    const proxyConf = proxyConfiguration
        ? await Actor.createProxyConfiguration({ ...proxyConfiguration })
        : undefined;

    let saved = 0;

    const crawler = new CheerioCrawler({
        proxyConfiguration: proxyConf,
        maxRequestRetries: 5,
        useSessionPool: true,
        sessionPoolOptions: {
            maxPoolSize: 50,
            sessionOptions: {
                maxUsageCount: 10,
                maxErrorScore: 3,
                errorScoreDecrement: 0.5,
            },
        },
        minConcurrency: 1,
        maxConcurrency: MAX_CONCURRENCY,
        requestHandlerTimeoutSecs: 60,

        preNavigationHooks: [
            async ({ request, session }) => {
                const profile = pickBrowserProfile();

                request.headers = {
                    ...(request.headers || {}),
                    'User-Agent': profile.ua,
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Upgrade-Insecure-Requests': '1',
                    Accept:
                        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Sec-CH-UA': profile.secChUa,
                    'Sec-CH-UA-Mobile': profile.secChUaMobile,
                    'Sec-CH-UA-Platform': profile.secChUaPlatform,
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Cache-Control': 'no-cache',
                };

                // Exponential backoff with jitter on retries
                if (request.retryCount > 0 && stealthDelays) {
                    const base = 1000; // 1s
                    const backoff = base * 2 ** (request.retryCount - 1);
                    const jitter = randomInt(0, 500);
                    await sleep(backoff + jitter);
                }

                // Network latency & human-like delay before requests
                if (stealthDelays) {
                    const label = request.userData?.label || 'LIST';
                    if (label === 'DETAIL') {
                        await randomDelay(400, 1400);
                    } else {
                        await randomDelay(250, 900);
                    }
                }

                if (session && profile.ua && !session.userData.browserUa) {
                    session.userData.browserUa = profile.ua;
                }
            },
        ],

        postNavigationHooks: [
            async ({ request }) => {
                if (!stealthDelays) return;
                const label = request.userData?.label || 'LIST';
                if (label === 'DETAIL') {
                    await randomDelay(500, 2000);
                } else {
                    await randomDelay(250, 1000);
                }
            },
        ],

        async requestHandler({ request, $, enqueueLinks, log: crawlerLog }) {
            const label = request.userData?.label || 'LIST';
            const pageNo = request.userData?.pageNo || 1;

            if (label === 'LIST') {
                if (saved >= RESULTS_WANTED) {
                    crawlerLog.info(
                        `LIST page ${pageNo} skipped – already have ${saved}/${RESULTS_WANTED} items.`,
                    );
                    return;
                }

                const links = findJobLinks($, request.url);
                crawlerLog.info(`LIST page ${pageNo} -> found ${links.length} job links`);

                if (!links.length) {
                    crawlerLog.info(
                        `LIST page ${pageNo} has no job links, stopping pagination from this branch.`,
                    );
                    return;
                }

                if (collectDetails) {
                    const remaining = RESULTS_WANTED - saved;
                    const toEnqueue = links.slice(0, Math.max(0, remaining));
                    if (toEnqueue.length) {
                        await enqueueLinks({
                            urls: toEnqueue,
                            userData: { label: 'DETAIL' },
                        });
                    }
                } else {
                    const remaining = RESULTS_WANTED - saved;
                    const toPush = links.slice(0, Math.max(0, remaining));
                    if (toPush.length) {
                        await Dataset.pushData(
                            toPush.map((u) => ({
                                url: u,
                                _source: 'careers24',
                            })),
                        );
                        saved += toPush.length;
                    }
                }

                if (saved < RESULTS_WANTED && pageNo < MAX_PAGES) {
                    const next = findNextPage($, request.url, pageNo);
                    if (next && next !== request.url) {
                        await enqueueLinks({
                            urls: [next],
                            userData: { label: 'LIST', pageNo: pageNo + 1 },
                        });
                    } else {
                        crawlerLog.debug(
                            `Pagination appears to end at page ${pageNo} for ${request.url}`,
                        );
                    }
                }
                return;
            }

            if (label === 'DETAIL') {
                if (saved >= RESULTS_WANTED) return;

                try {
                    const json = extractFromJsonLd($);
                    const data = json || {};

                    // Title
                    if (!data.title) {
                        data.title =
                            $('h1, .job-title, [itemprop="title"]')
                                .first()
                                .text()
                                .trim() || null;
                    }

                    // Company
                    if (!data.company) {
                        const companyEl = $(
                            '[itemprop="hiringOrganization"], .company-name, a[href*="/now-hiring/"]',
                        ).first();
                        data.company =
                            companyEl.text().trim() ||
                            companyEl.attr('title') ||
                            companyEl.attr('aria-label') ||
                            null;
                    }

                    // ── Job description root ─────────────────────────────
                    let descRoot = $('.row.c24-vacancy-details').first();

                    // Narrow to the column that contains "Vacancy Details" heading if available
                    const vdHeading = $('h1, h2')
                        .filter((_, el) => $(el).text().trim() === 'Vacancy Details')
                        .first();
                    if (vdHeading.length) {
                        const col = vdHeading.closest('section, div, article');
                        if (col.length) descRoot = col;
                    }

                    if (!descRoot || !descRoot.length) {
                        descRoot = $(
                            '[itemprop="description"], .job-description, .job-details__description, .description, #job-description, .job-description-section, .jobDetails',
                        ).first();
                    }

                    if (!descRoot || !descRoot.length) {
                        descRoot = $('.job-view, .job-details-page, article.job, .job-content, main').first();
                    }

                    let description_html = null;
                    let description_text = null;

                    // Prefer DOM over JSON-LD for precise control, but still use JSON-LD if DOM missing
                    if (descRoot && descRoot.length) {
                        const { html, text } = extractSanitizedContent(descRoot.html() || '');
                        description_html = html;
                        description_text = text;
                    }

                    if ((!description_text || description_text.length < 200) && data.description_html) {
                        const { html, text } = extractSanitizedContent(data.description_html);
                        if (text && text.length > (description_text || '').length) {
                            description_html = html;
                            description_text = text;
                        }
                    }

                    // As final fallback for short descriptions, slightly broaden
                    if (!description_text || description_text.length < 200) {
                        const broadRoot = $('.job-view, .job-details-page, article.job, .job-content')
                            .first();
                        if (broadRoot && broadRoot.length) {
                            const { html, text } = extractSanitizedContent(broadRoot.html() || '');
                            if (text && text.length > (description_text || '').length) {
                                description_html = html;
                                description_text = text;
                            }
                        }
                    }

                    // ── Meta block: location / salary / job type / sectors / job_id ────────────
                    const summaryMeta = extractMetaFromSummary($);
                    if (!data.location && summaryMeta.location) {
                        data.location = summaryMeta.location;
                    }
                    if (!data.salary && summaryMeta.salary) {
                        data.salary = summaryMeta.salary;
                    }
                    if (!data.employment_type && summaryMeta.employment_type) {
                        data.employment_type = summaryMeta.employment_type;
                    }

                    // sectors: summary -> scripts(job_sector)
                    let sectors = summaryMeta.sectors || null;
                    if (!sectors) {
                        sectors = extractSectorsFromScripts($) || null;
                    }
                    data.sectors = sectors;

                    let jobIdMeta = summaryMeta.job_id || null;

                    // Fallbacks from selectors
                    if (!data.location) {
                        data.location =
                            $('[itemprop="jobLocation"], .job-location, .location')
                                .first()
                                .text()
                                .trim() || null;
                    }

                    if (!data.salary) {
                        const salaryText = $(
                            '[itemprop="baseSalary"], .salary, .job-salary',
                        )
                            .first()
                            .text()
                            .trim();
                        data.salary = salaryText || null;
                    }

                    if (!data.employment_type) {
                        data.employment_type =
                            $('[itemprop="employmentType"], .job-type')
                                .first()
                                .text()
                                .trim() || null;
                    }

                    if (!data.date_posted) {
                        const dateText = $(
                            '.date-posted, .posted-date, [itemprop="datePosted"]',
                        )
                            .first()
                            .text()
                            .trim();
                        data.date_posted = dateText || null;
                    }

                    // ── Company description (strict) ─────────────────────
                    const company_description = extractCompanyDescription($, data.company);

                    // Job ID: meta -> URL
                    const urlJobId = extractJobIdFromUrl(request.url);
                    const job_id = jobIdMeta || urlJobId || null;

                    // Normalize core fields
                    const sectorFromInput = normalizeText(sector);
                    const normalized = {
                        title: normalizeText(data.title),
                        company: normalizeText(data.company),
                        location: normalizeText(data.location),
                        salary: normalizeText(data.salary),
                        employment_type: normalizeText(data.employment_type),
                        date_posted: normalizeText(data.date_posted),
                        valid_through: normalizeText(data.valid_through),
                        sectors: normalizeText(data.sectors),
                        job_id: normalizeText(job_id),
                    };

                    const item = {
                        schema_version: 8,
                        source: 'careers24',
                        scraped_at: new Date().toISOString(),

                        title: normalized.title,
                        company: normalized.company,
                        location: normalized.location,
                        salary: normalized.salary,
                        job_type: normalized.employment_type,
                        date_posted: normalized.date_posted,
                        valid_through: normalized.valid_through,

                        // single ID column
                        job_id: normalized.job_id || null,

                        // sectors (page -> input)
                        sectors: normalized.sectors || sectorFromInput || null,

                        // Descriptions
                        description_html: description_html || null,  // only clean text tags, no attributes
                        description_text: description_text || null,

                        // Company info: either a real company profile, or null (never generic Careers24)
                        company_description: company_description || null,

                        url: request.url,
                    };

                    await Dataset.pushData(item);
                    saved++;
                    crawlerLog.info(
                        `Scraped job ${saved}/${RESULTS_WANTED}: ${item.title || '(no title)'}`,
                    );
                } catch (err) {
                    crawlerLog.error(`DETAIL ${request.url} failed: ${err.message}`);
                }
            }
        },

        failedRequestHandler: async ({ request, log: crawlerLog }) => {
            crawlerLog.warning(
                `Request ${request.url} failed too many times (retries: ${request.retryCount}).`,
            );
        },
    });

    await crawler.run(
        initial.map((u) => ({
            url: u,
            userData: { label: 'LIST', pageNo: 1 },
        })),
    );
    log.info(`Finished. Successfully saved ${saved} job listings`);
});
