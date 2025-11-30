# Careers24 Jobs Scraper

Extract comprehensive job listings from Careers24.com, South Africa's premier employment portal. This powerful scraper enables you to search and collect job postings with detailed information including job titles, companies, salaries, locations, descriptions, and more across all South African provinces.

## What is Careers24 Jobs Scraper?

Careers24 Jobs Scraper is an automated data extraction tool designed specifically for Careers24.com, one of South Africa's most popular job search platforms. Whether you're conducting market research, building job aggregation services, analyzing employment trends, or seeking career opportunities, this scraper provides comprehensive access to job listings across multiple sectors and locations in South Africa.

## Key Features

- **Comprehensive Data Extraction**: Scrapes job titles, company names, locations, salaries, job types, posting dates, and full descriptions
- **Advanced Filtering**: Search by keywords, locations, sectors, minimum salary, and remote work preferences
- **Smart Pagination**: Automatically navigates through multiple pages of search results
- **Structured Data Support**: Leverages JSON-LD structured data when available for accurate extraction
- **Flexible Configuration**: Control the number of results, pages, and level of detail extraction
- **Export Ready**: Output data in JSON, CSV, Excel, HTML, or XML formats
- **Reliable Performance**: Built with robust error handling and proxy support

## Use Cases

- **Job Market Analysis**: Track employment trends, salary ranges, and in-demand skills across South African provinces
- **Job Aggregation**: Build comprehensive job boards or career portals with fresh listings
- **Career Research**: Help job seekers find opportunities matching their skills and location preferences
- **Recruitment Intelligence**: Monitor competitor hiring activities and industry demand
- **Automated Job Alerts**: Schedule regular scrapes to discover new opportunities in your field

## Input Configuration

Configure the scraper with the following parameters:

### Basic Search Parameters

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| **keyword** | String | Job title or keyword to search for | `"software developer"`, `"accountant"`, `"nurse"` |
| **location** | String | South African location filter | `"gauteng"`, `"western-cape"`, `"eastern-cape"` |
| **sector** | String | Job sector/category filter | `"IT"`, `"Finance"`, `"Healthcare"` |
| **remoteOnly** | Boolean | Show only remote job opportunities | `true` or `false` (default: `false`) |
| **minSalary** | String | Minimum monthly salary in ZAR | `"12000"`, `"24000"`, `"36000"` |

### Advanced Options

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| **startUrl** | String | Direct Careers24 search URL (overrides other filters) | - |
| **collectDetails** | Boolean | Visit each job page to extract full details | `true` |
| **results_wanted** | Integer | Maximum number of jobs to collect | `100` |
| **max_pages** | Integer | Maximum search result pages to scrape | `20` |
| **proxyConfiguration** | Object | Proxy settings for reliable scraping | Apify Proxy |

### Example Input

```json
{
  "keyword": "data analyst",
  "location": "gauteng",
  "sector": "IT",
  "minSalary": "24000",
  "remoteOnly": false,
  "results_wanted": 50,
  "max_pages": 5,
  "collectDetails": true
}
```

## Output Format

Each job listing in the dataset contains the following fields:

```json
{
  "title": "Senior Software Developer",
  "company": "Tech Solutions (Pty) Ltd",
  "sector": "IT",
  "location": "Johannesburg, Gauteng",
  "salary": "R35,000 - R50,000 per month",
  "job_type": "Permanent",
  "date_posted": "2025-11-28",
  "valid_through": "2025-12-28",
  "description_html": "<p>We are seeking an experienced developer...</p>",
  "description_text": "We are seeking an experienced developer...",
  "url": "https://www.careers24.com/jobs/adverts/..."
}
```

### Output Fields Description

- **title**: Job position title
- **company**: Hiring organization name
- **sector**: Industry sector or category
- **location**: Geographic location (city, province, or remote)
- **salary**: Salary information in South African Rand (ZAR)
- **job_type**: Employment type (Permanent, Contract, Temporary, etc.)
- **date_posted**: When the job was listed
- **valid_through**: Application deadline (if available)
- **description_html**: Full job description with formatting
- **description_text**: Plain text version of the description
- **url**: Direct link to the job posting

## How to Use

### On Apify Platform

1. Navigate to the Careers24 Jobs Scraper actor page
2. Click **Try for free** or **Start**
3. Configure your search parameters in the input fields
4. Click **Start** to begin scraping
5. Download results in your preferred format (JSON, CSV, Excel, etc.)

### Via API

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({
    token: 'YOUR_APIFY_TOKEN',
});

const input = {
    keyword: "software engineer",
    location: "gauteng",
    results_wanted: 50,
    collectDetails: true
};

const run = await client.actor("your-actor-name").call(input);
const { items } = await client.dataset(run.defaultDatasetId).listItems();

console.log(items);
```

### Integrations

Export scraped data directly to:
- **Google Sheets**: For easy analysis and sharing
- **Make (Integromat)**: Automate workflows
- **Zapier**: Connect to 5,000+ apps
- **Slack/Email**: Get instant notifications
- **Your Database**: Via webhooks or API

## Performance & Limits

- **Speed**: Scrapes 50-100 jobs per minute (varies by detail level)
- **Reliability**: Built-in retry logic and error handling
- **Efficiency**: Optimized for minimal resource consumption
- **Scalability**: Handles searches with thousands of results

## Tips for Best Results

- **Use Specific Keywords**: More specific searches yield better-targeted results
- **Enable Proxy**: Recommended for larger scrapes to avoid rate limiting
- **Set Reasonable Limits**: Start with smaller `results_wanted` values for testing
- **Schedule Regular Runs**: Set up scheduled runs to track new job postings
- **Combine Filters**: Use location + sector + keyword for precise targeting

## Pricing

This actor runs on the Apify platform with transparent, pay-as-you-go pricing:

- **Free Tier**: $5 free platform credits for new users
- **Cost**: Approximately $0.10-0.25 per 1,000 jobs scraped
- **Pricing Model**: Based on compute units consumed during runtime

[View detailed pricing](https://apify.com/pricing)

## Legal & Ethical Use

This scraper is designed for legitimate purposes including market research, job aggregation, and career exploration. Users must:

- Comply with Careers24.com's terms of service
- Respect robots.txt and rate limiting
- Use data responsibly and ethically
- Ensure compliance with applicable data protection laws (POPIA, GDPR)

The scraper includes built-in rate limiting and respectful crawling practices.

## Support & Feedback

Need help or have suggestions?

- Report issues or request features through Apify
- Join the [Apify Discord](https://discord.com/invite/jyEM2PRvMU) for support
- [Apify Platform Docs](https://docs.apify.com)

## Version History

**v1.0.0** (2025-11-30)
- Initial release for Careers24.com
- Support for keyword, location, sector, and salary filtering
- Remote jobs filtering capability
- Comprehensive job detail extraction
- JSON-LD structured data support

---

<p align="center">
  <strong>Made with ❤️ for the South African job market</strong><br>
  Powered by <a href="https://apify.com">Apify</a>
</p>