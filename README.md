# Marriott DMM Archive

A web-based archive tool for browsing and previewing deployed Marriott Bonvoy email campaigns (eDMs). Data is fetched live from Smartsheet and cached locally for fast access.

## Features

- **Smartsheet Integration** — Automatically pulls deployed email campaign data via Smartsheet API
- **Local Caching** — Caches data in `localStorage` with 24-hour expiry and background update checks
- **Email Preview** — View emails in mobile (375px), tablet (768px), and desktop (1200px) viewports
- **Copy HTML** — Copy the full HTML source of any email to clipboard
- **Filtering** — Filter by year, month, area, and target market
- **Search** — Full-text search across campaign name, description, type, template, market, and more
- **Broken Link Detection** — Automatically checks and flags broken preview URLs
- **Password Protected** — Simple password gate with session persistence
- **Responsive Design** — Dark-themed UI optimized for desktop and tablet use

## Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript (no frameworks)
- **Backend:** Netlify Functions (serverless Node.js)
- **Data Source:** Smartsheet API v2.0
- **Hosting:** Netlify

## Project Structure

```
├── index.html                    # Main page (landing + year view)
├── preview.html                  # Email preview page with device toggle
├── app.js                        # UI logic (filters, rendering, navigation)
├── data.js                       # Smartsheet data fetching + caching
├── styles.css                    # All styles
├── netlify.toml                  # Netlify build config
├── .gitignore
└── netlify/
    └── functions/
        ├── smartsheet.js         # Smartsheet API proxy (pagination)
        ├── check-url.js          # URL health checker (HEAD request)
        └── fetch-html.js         # Fetches email HTML for preview/copy
```

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (for local development)
- [Netlify CLI](https://docs.netlify.com/cli/get-started/) (`npm install -g netlify-cli`)
- A Smartsheet API token with read access to the email tracker sheet

### Local Development

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd eDM-History-Tool-2026
   ```

2. Start the Netlify dev server:
   ```bash
   netlify dev
   ```

3. Open `http://localhost:8888` in your browser.

4. Enter the password to access the archive.

### Deployment

Push to the connected Git branch — Netlify auto-deploys on push.

Make sure the Smartsheet API token is set as an environment variable in **Netlify > Site settings > Environment variables** if it's not hardcoded in the function.

## How It Works

### Data Flow

1. On page load, `data.js` checks `localStorage` for cached data
2. If cache is valid (< 24 hours), it loads instantly and checks for updates in the background
3. If cache is expired or missing, it fetches all data from Smartsheet via the `smartsheet` Netlify Function
4. Only rows with status **"Deployed"** and year **>= 2026** are included
5. Preview URLs are validated via the `check-url` function — broken links are flagged

### Smartsheet Field Mapping

| Smartsheet Column ID | Field               |
|----------------------|---------------------|
| 1156879576524676     | requestId           |
| 6252542022707076     | status              |
| 2300228855457668     | earliestDeploymentDate |
| 6803828482828164     | latestDeploymentDate |
| 7623657374568324     | campaignName        |
| 3187176543309700     | campaignDescription |
| 3371405229746052     | campaignType        |
| 3496432308014980     | area                |
| 5596505414258564     | targetMarket        |
| 5195369913995140     | previewLink         |

### Manual Sync

Click the **sync button** (circular arrow icon) in the navigation bar to force a full data refresh from Smartsheet. A full-screen overlay blocks interaction during the sync.

## Area Codes

| Code | Area                        |
|------|-----------------------------|
| ANZP | Australia, NZ & Pacific     |
| APEC | Asia Pacific (excl. China)  |
| GC   | Greater China               |
| IM   | International Markets       |
| JPG  | Japan & Guam                |
| SA   | South Asia                  |
| SKPV | South Korea, Philippines & Vietnam |
| SM   | Select Markets              |
