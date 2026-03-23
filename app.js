/* ============================================
   Marriott Bonvoy Email Oasis — App Logic
   ============================================ */

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

let currentYear = null;
let currentMonth = "all";

// ---- Navigation ----

function showLanding() {
    document.getElementById("landing").classList.remove("hidden");
    document.getElementById("yearView").classList.add("hidden");
    document.getElementById("navbar").classList.add("nav-hidden");
    window.scrollTo(0, 0);
    currentYear = null;
    currentMonth = "all";
    sessionStorage.removeItem("edm_year");
}

function loadYear(year) {
    if (!DATA_LOADED) {
        showLoading("Loading data from Smartsheet...");
        const check = setInterval(() => {
            if (DATA_LOADED) {
                clearInterval(check);
                hideLoading();
                loadYear(year);
            }
        }, 500);
        return;
    }

    currentYear = year;
    currentMonth = "all";
    sessionStorage.setItem("edm_year", String(year));

    document.getElementById("landing").classList.add("hidden");
    document.getElementById("yearView").classList.remove("hidden");
    document.getElementById("navbar").classList.remove("nav-hidden");

    populateYearFilter();
    document.getElementById("yearFilter").value = String(year);

    populateFilters();
    updateMonthPills();
    applyFilters();
    window.scrollTo(0, 0);
}

function onYearFilterChange() {
    const year = parseInt(document.getElementById("yearFilter").value);
    currentYear = year;
    currentMonth = "all";

    populateFilters();
    updateMonthPills();
    applyFilters();
}

// ---- Loading Indicator ----

function showLoading(message) {
    let loader = document.getElementById("dataLoader");
    if (!loader) {
        loader = document.createElement("div");
        loader.id = "dataLoader";
        loader.className = "data-loader";
        document.body.appendChild(loader);
    }
    loader.textContent = message || "Loading...";
    loader.classList.remove("hidden");
}

function hideLoading() {
    const loader = document.getElementById("dataLoader");
    if (loader) loader.classList.add("hidden");
}

// ---- Month Pills ----

function selectMonth(month) {
    currentMonth = month;
    updateMonthPills();
    applyFilters();
}

function updateMonthPills() {
    const emails = EMAIL_DATA[currentYear] || [];
    const monthsWithData = new Set(emails.map(e => e.month));

    document.querySelectorAll(".month-pill").forEach(pill => {
        const m = pill.getAttribute("data-month");
        pill.classList.toggle("active", m === currentMonth);

        // Dim months with no data (except "All")
        if (m !== "all") {
            pill.classList.toggle("month-pill-empty", !monthsWithData.has(m));
        }
    });
}

// ---- Year Dropdown ----

function populateYearFilter() {
    const yearFilter = document.getElementById("yearFilter");
    const dataYears = Object.keys(EMAIL_DATA).map(Number);
    const currentCalendarYear = new Date().getFullYear();
    const maxYear = Math.max(2026, currentCalendarYear, ...dataYears);

    const years = [];
    for (let y = maxYear; y >= 2026; y--) {
        years.push(y);
    }

    const prevValue = yearFilter.value;
    yearFilter.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");

    // Restore previous selection if still valid
    if (years.includes(parseInt(prevValue))) {
        yearFilter.value = prevValue;
    }
}

// ---- Filters ----

function populateFilters() {
    const emails = EMAIL_DATA[currentYear] || [];
    const areaFilter = document.getElementById("areaFilter");
    const marketFilter = document.getElementById("marketFilter");

    const prevArea = areaFilter.value;
    const prevMarket = marketFilter.value;

    // Areas
    const areas = [...new Set(emails.map(e => e.area).filter(Boolean))].sort();
    areaFilter.innerHTML = '<option value="all">All Areas</option>';
    areas.forEach(a => {
        areaFilter.innerHTML += `<option value="${a}">${a}</option>`;
    });

    // Markets
    const markets = [...new Set(emails.map(e => e.targetMarket).filter(Boolean))].sort();
    marketFilter.innerHTML = '<option value="all">All Markets</option>';
    markets.forEach(m => {
        marketFilter.innerHTML += `<option value="${m}">${m}</option>`;
    });

    // Restore
    if ([...areaFilter.options].some(o => o.value === prevArea)) areaFilter.value = prevArea;
    if ([...marketFilter.options].some(o => o.value === prevMarket)) marketFilter.value = prevMarket;
}

function applyFilters() {
    const emails = EMAIL_DATA[currentYear] || [];
    const area = document.getElementById("areaFilter").value;
    const market = document.getElementById("marketFilter").value;
    const search = document.getElementById("searchInput").value.toLowerCase().trim();

    // Highlight active dropdowns
    document.getElementById("areaFilter").classList.toggle("filter-active", area !== "all");
    document.getElementById("marketFilter").classList.toggle("filter-active", market !== "all");

    // Show/hide search clear button
    document.getElementById("searchClear").classList.toggle("hidden", !search);

    const filtered = emails.filter(e => {
        if (area !== "all" && e.area !== area) return false;
        if (market !== "all" && e.targetMarket !== market) return false;
        if (currentMonth !== "all" && e.month !== currentMonth) return false;
        if (search) {
            const searchableText = [
                e.requestId,
                e.campaignName,
                e.campaignDescription || "",
                e.area,
                e.targetMarket || "",
                e.additionalTargetMarkets || "",
                e.month,
                e.earliestDeploymentDate || "",
                e.campaignType || "",
                e.emailTemplate || ""
            ].join(" ").toLowerCase();
            if (!searchableText.includes(search)) return false;
        }
        return true;
    });

    renderEmails(filtered, search);
    renderFilterSummary(area, market, search, filtered.length, emails.length);
    renderResultsHeader(filtered.length);
}

function resetFilters() {
    document.getElementById("areaFilter").value = "all";
    document.getElementById("marketFilter").value = "all";
    document.getElementById("searchInput").value = "";
    currentMonth = "all";
    updateMonthPills();
    applyFilters();
}

function clearSearch() {
    document.getElementById("searchInput").value = "";
    applyFilters();
    document.getElementById("searchInput").focus();
}

function removeFilter(type) {
    if (type === "area") document.getElementById("areaFilter").value = "all";
    if (type === "market") document.getElementById("marketFilter").value = "all";
    if (type === "month") { currentMonth = "all"; updateMonthPills(); }
    if (type === "search") document.getElementById("searchInput").value = "";
    applyFilters();
}

// ---- Filter Summary (active filter pills) ----

function renderFilterSummary(area, market, search, count, total) {
    const container = document.getElementById("filterSummary");
    const pills = [];

    if (currentMonth !== "all") {
        pills.push(makePill("Month: " + currentMonth, "month"));
    }
    if (area !== "all") {
        pills.push(makePill("Area: " + area, "area"));
    }
    if (market !== "all") {
        pills.push(makePill("Market: " + market, "market"));
    }
    if (search) {
        pills.push(makePill('Search: "' + escapeHtml(search) + '"', "search"));
    }

    container.innerHTML = pills.join("");
}

function makePill(label, type) {
    return `<span class="filter-pill">
        ${label}
        <button onclick="removeFilter('${type}')" aria-label="Remove filter">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
        </button>
    </span>`;
}

// ---- Results Header ----

function renderResultsHeader(count) {
    const header = document.getElementById("resultsHeader");
    header.innerHTML = `
        <h2>${currentYear} Emails</h2>
        <span class="results-count">${count} email${count !== 1 ? "s" : ""}</span>
    `;
}

// ---- Rendering ----

function getAreaClass(area) {
    const code = (area || "").split(" ")[0].toLowerCase();
    const map = {
        "anzp": "area-anzp",
        "apec": "area-apec",
        "gc": "area-gc",
        "im": "area-im",
        "jpg": "area-jpg",
        "sa": "area-sa",
        "skpv": "area-skpv",
        "sm": "area-sm"
    };
    return map[code] || "area-other";
}

function highlightText(text, search) {
    if (!search) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const searchEscaped = escapeHtml(search);
    const regex = new RegExp(`(${searchEscaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi");
    return escaped.replace(regex, '<span class="search-highlight">$1</span>');
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function renderEmails(emails, search) {
    const container = document.getElementById("emailSections");
    const noResults = document.getElementById("noResults");

    if (emails.length === 0) {
        container.innerHTML = "";
        noResults.classList.remove("hidden");
        return;
    }

    noResults.classList.add("hidden");

    // Group by month
    const grouped = {};
    emails.forEach(e => {
        if (!grouped[e.month]) grouped[e.month] = [];
        grouped[e.month].push(e);
    });

    const sortedMonths = Object.keys(grouped).sort(
        (a, b) => MONTHS.indexOf(a) - MONTHS.indexOf(b)
    );

    let html = "";

    sortedMonths.forEach(month => {
        const monthEmails = grouped[month];
        const monthId = month.toLowerCase().substring(0, 3);

        html += `
        <section class="month-section" id="${monthId}">
            <h3 class="month-heading">${month} - ${currentYear}</h3>
            <p class="month-count">${monthEmails.length} email${monthEmails.length !== 1 ? "s" : ""}</p>
            <div class="email-grid">
        `;

        monthEmails.forEach(email => {
            const nameDisplay = highlightText(email.campaignName || "Untitled", search);
            const areaDisplay = highlightText(email.area || "", search);
            const descDisplay = email.campaignDescription ? highlightText(email.campaignDescription, search) : "";
            const deployDate = formatDate(email.earliestDeploymentDate) || formatDate(email.latestDeploymentDate) || "";
            const hasPreview = email.previewLink && email.previewLink.trim() !== "" && !email._brokenPreview;

            const previewPageUrl = hasPreview ? `preview.html?url=${encodeURIComponent(email.previewLink)}&id=${encodeURIComponent(email.requestId || "")}&name=${encodeURIComponent(email.campaignName || "")}` : "";

            html += `
            <div class="email-card">
                <div class="card-previews">
                    ${hasPreview ? `<a href="${previewPageUrl}">` : "<div>"}
                        <div class="preview-mobile">
                            ${hasPreview ? `<iframe src="${email.previewLink}" loading="lazy" sandbox="allow-same-origin" title="Mobile preview of ${email.requestId}"></iframe>` : `<div class="preview-placeholder">No Preview</div>`}
                        </div>
                        <div class="preview-tablet">
                            ${hasPreview ? `<iframe src="${email.previewLink}" loading="lazy" sandbox="allow-same-origin" title="Tablet preview of ${email.requestId}"></iframe>` : `<div class="preview-placeholder">No Preview Available</div>`}
                        </div>
                        ${hasPreview ? `<div class="card-hover-overlay"><span>View Email</span></div>` : ""}
                    ${hasPreview ? "</a>" : "</div>"}
                </div>
                <div class="card-body">
                    <div class="card-id">${highlightText(email.requestId || "", search)}</div>
                    <div class="card-title">${nameDisplay}</div>
                    ${descDisplay ? `<div class="card-description"><strong>Description:</strong> ${descDisplay}</div>` : ""}
                    ${deployDate ? `<div class="card-send-date"><strong>Deployment:</strong> ${highlightText(deployDate, search)}</div>` : ""}
                    ${email.campaignType ? `<div class="card-meta"><strong>Type:</strong> ${highlightText(email.campaignType, search)}</div>` : ""}
                    ${email.campaignGoal ? `<div class="card-meta"><strong>Goal:</strong> ${highlightText(email.campaignGoal, search)}</div>` : ""}
                    ${email.emailTemplate ? `<div class="card-meta"><strong>Template:</strong> ${highlightText(email.emailTemplate, search)}</div>` : ""}
                    ${email.targetLanguage ? `<div class="card-meta"><strong>Language:</strong> ${highlightText(email.targetLanguage, search)}</div>` : ""}
                    <div class="card-tags">
                        <span class="card-area-tag ${getAreaClass(email.area)}">${areaDisplay}</span>
                        ${email.targetMarket ? `<span class="card-market-tag market-target">${highlightText(email.targetMarket, search)}</span>` : ""}
                    </div>
                    ${email.additionalTargetMarkets ? `<div class="card-meta card-meta-small"><strong>Additional Markets:</strong> ${highlightText(email.additionalTargetMarkets, search)}</div>` : ""}
                    <div class="card-links">
                        ${hasPreview ? `<a href="${previewPageUrl}" class="card-link">View Email</a>` : `<span class="card-link card-link-disabled">No Preview</span>`}
                    </div>
                </div>
            </div>`;
        });

        html += `
            </div>
        </section>`;
    });

    container.innerHTML = html;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ---- Scroll Effects ----

window.addEventListener("scroll", () => {
    const navbar = document.getElementById("navbar");
    const backToTop = document.getElementById("backToTop");

    navbar.classList.toggle("scrolled", window.scrollY > 50);
    backToTop.classList.toggle("visible", window.scrollY > 400);
});

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---- Keyboard Shortcut ----

document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "SELECT") {
        e.preventDefault();
        const searchInput = document.getElementById("searchInput");
        if (searchInput) searchInput.focus();
    }
    if (e.key === "Escape" && document.activeElement.id === "searchInput") {
        clearSearch();
        document.activeElement.blur();
    }
});

// ---- Password Gate ----

function checkPassword() {
    const input = document.getElementById("gatePassword").value;
    if (input === "MT2026!") {
        unlockSite();
    } else {
        const error = document.getElementById("gateError");
        const card = document.querySelector(".gate-card");
        error.classList.remove("hidden");
        card.classList.remove("gate-shake");
        void card.offsetWidth;
        card.classList.add("gate-shake");
    }
    return false;
}

function unlockSite() {
    sessionStorage.setItem("edm_auth", "1");
    document.getElementById("passwordGate").classList.add("hidden");
    document.getElementById("siteContent").classList.remove("hidden");
    restoreView();
}

function restoreView() {
    const savedYear = sessionStorage.getItem("edm_year");
    if (savedYear) {
        loadYear(parseInt(savedYear));
    } else {
        showLanding();
    }
}

function logout() {
    sessionStorage.removeItem("edm_auth");
    sessionStorage.removeItem("edm_year");
    document.getElementById("siteContent").classList.add("hidden");
    document.getElementById("passwordGate").classList.remove("hidden");
    document.getElementById("gatePassword").value = "";
    document.getElementById("gateError").classList.add("hidden");
    document.getElementById("gatePassword").focus();
    currentYear = null;
}

// ---- Init ----

document.addEventListener("DOMContentLoaded", () => {
    if (sessionStorage.getItem("edm_auth") === "1") {
        document.getElementById("passwordGate").classList.add("hidden");
        document.getElementById("siteContent").classList.remove("hidden");
        restoreView();
    } else {
        document.getElementById("gatePassword").focus();
    }
});
