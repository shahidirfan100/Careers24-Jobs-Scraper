// Careers24 jobs scraper - CheerioCrawler implementation (enhanced)
import { Actor, log } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';
import { load as cheerioLoad } from 'cheerio';

// --- Simple desktop User-Agent pool for stealth ---
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
];

const randomDesktopUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// Single-entrypoint main
await Actor.init();

async function main() {
    try {
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
        } = input;

        const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW)
            ? Math.max(1, +RESULTS_WANTED_RAW)
            : Number.MAX_SAFE_INTEGER;
        const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW)
            ? Math.max(1, +MAX_PAGES_RAW)
            : 999;

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

        const cleanText = (html) => {
            if (!html) return '';
            const $ = cheerioLoad(html);
            $('script, style, noscript, iframe').remove();
            return $.root().text().replace(/\s+/g, ' ').trim();
        };

        const buildStartUrl = (kw, loc, sect, remOnly, minSal) => {
            let u = new URL('https://www.careers24.com/jobs/');

            // Build path for location
            if (loc) {
                const locSlug = String(loc).toLowerCase().replace(/\s+/g, '-');
                u = new URL(`https://www.careers24.com/jobs/lc-${locSlug}/`);
            }

            // Add remote filter to path
            if (remOnly) {
                u.pathname += 'rmt-only/';
            } else {
                u.pathname += 'rmt-incl/';
            }

            // Add query parameters
            u.searchParams.set('sort', 'dateposted');
            if (kw) u.searchParams.set('q', String(kw).trim());
            if (sect) u.searchParams.set('sectors', String(sect).trim());
            if (minSal) u.searchParams.set('minsalary', String(minSal).trim());

            return u.href;
        };

        const initial = [];
        if (Array.isArray(startUrls) && startUrls.length) initial.push(...startUrls);
        if (startUrl) initial.push(startUrl);
        if (url) initial.push(url);
        if (!initial.length) initial.push(buildStartUrl(keyword, location, sector, remoteOnly, minSalary));

        const proxyConf = proxyConfiguration
            ? await Actor.createProxyConfiguration({ ...proxyConfiguration })
            : undefined;

        let saved = 0;

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
                } catch (e) {
                    /* ignore parsing errors */
                }
            }
            return null;
        }

        function findJobLinks($, base) {
            const links = new Set();
            // Careers24 specific job link patterns
            $('a[href*="/jobs/adverts/"]').each((_, a) => {
                const href = $(a).attr('href');
                if (!href) return;
                const abs = toAbs(href, base);
                if (abs && !abs.includes('/now-hiring/')) links.add(abs);
            });
            return [...links];
        }

        function findNextPage($, base, currentPage) {
            // Careers24 uses page parameter
            const nextPageNum = currentPage + 1;
            const nextBtn = $('a')
                .filter((_, el) => {
                    const text = $(el).text().trim();
                    return text === '>' || text === 'Next' || text === String(nextPageNum);
                })
                .first();

            const href = nextBtn.attr('href');
            if (href) return toAbs(href, base);

            // Try to build next page URL manually
            const currentUrl = new URL(base);
            currentUrl.searchParams.set('page', String(nextPageNum));
            const candidate = currentUrl.href;
            if (candidate === base) return null;
            return candidate;
        }

        // Extract meta like Location / Salary / Job Type / Sectors / Reference from summary block
        function extractMetaFromSummary($) {
            const meta = {};
            const block = $('.job-summary, .job-details, .job-info, .job-summary-list').first();
            if (!block || !block.length) return meta;

            block.find('li').each((_, li) => {
                const $li = $(li);
                let text = $li.text().replace(/\s+/g, ' ').trim();
                if (!text) return;

                let label = '';
                let value = '';

                // Common pattern "Label: Value"
                const parts = text.split(':');
                if (parts.length > 1) {
                    label = parts[0].trim().toLowerCase();
                    value = parts.slice(1).join(':').trim();
                } else {
                    // Try bold/strong label then rest as value
                    const strong = $li.find('strong, b').first().text().trim();
                    if (strong) {
                        label = strong.replace(/:$/, '').trim().toLowerCase();
                        const clone = $li.clone();
                        clone.find('strong, b').remove();
                        value = clone.text().replace(/\s+/g, ' ').trim();
                    }
                }

                if (!value) {
                    value =
                        $li
                            .find('span, .value')
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
                        meta.salary = value;
                        break;
                    case 'job type':
                    case 'type':
                        meta.employment_type = value;
                        break;
                    case 'sectors':
                    case 'sector':
                        meta.sectors = value;
                        break;
                    case 'reference':
                    case 'ref':
                    case 'ref.':
                        meta.reference = value;
                        break;
                    default:
                        break;
                }
            });

            return meta;
        }

        const crawler = new CheerioCrawler({
            proxyConfiguration: proxyConf,
            maxRequestRetries: 3,
            useSessionPool: true,
            maxConcurrency: 10,
            requestHandlerTimeoutSecs: 60,
            preNavigationHooks: [
                async ({ request }) => {
                    request.headers = {
                        ...(request.headers || {}),
                        'User-Agent': randomDesktopUA(),
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Upgrade-Insecure-Requests': '1',
                    };
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

                        // Fallback selectors for Careers24 (title, company, description)
                        if (!data.title) {
                            data.title =
                                $('h1, .job-title, [itemprop="title"]')
                                    .first()
                                    .text()
                                    .trim() || null;
                        }

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

                        if (!data.description_html) {
                            // Try several possible wrappers to capture the full job description content
                            const desc = $(
                                '[itemprop="description"], .job-description, .description, #job-description, .job-description-section, .jobDetails',
                            ).first();
                            data.description_html =
                                desc && desc.length ? String(desc.html()).trim() : null;
                        }
                        data.description_text = data.description_html
                            ? cleanText(data.description_html)
                            : null;

                        // Meta block: location / salary / type / sectors / reference
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
                        if (summaryMeta.sectors) {
                            data.sectors = summaryMeta.sectors;
                        }
                        if (summaryMeta.reference) {
                            data.reference = summaryMeta.reference;
                        }

                        // Fallbacks directly from simple selectors if still missing
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

                        // Company description / about company
                        let company_description_html = null;
                        let company_description_text = null;
                        const companyDescEl = $(
                            '.company-description, .about-company, #company-profile, .about-company-section, .company-profile',
                        ).first();
                        if (companyDescEl && companyDescEl.length) {
                            company_description_html = String(companyDescEl.html()).trim();
                            company_description_text = cleanText(company_description_html);
                        }

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
                            reference: normalizeText(data.reference),
                        };

                        const item = {
                            schema_version: 2,
                            source: 'careers24',
                            scraped_at: new Date().toISOString(),
                            title: normalized.title,
                            company: normalized.company,
                            location: normalized.location,
                            salary: normalized.salary,
                            job_type: normalized.employment_type,
                            date_posted: normalized.date_posted,
                            valid_through: normalized.valid_through,
                            sectors: normalized.sectors || sectorFromInput || null,
                            reference: normalized.reference || null,
                            description_html: data.description_html || null,
                            description_text: data.description_text || null,
                            company_description_html: company_description_html || null,
                            company_description_text: company_description_text || null,
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
        });

        await crawler.run(
            initial.map((u) => ({
                url: u,
                userData: { label: 'LIST', pageNo: 1 },
            })),
        );
        log.info(`Finished. Successfully saved ${saved} job listings`);
    } finally {
        await Actor.exit();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
