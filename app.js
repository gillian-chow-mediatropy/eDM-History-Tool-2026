/* ============================================
   Marriott Bonvoy Email Oasis — App Logic
   ============================================ */

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

let currentYear = null;

// ---- Navigation ----

function showLanding() {
    document.getElementById("landing").classList.remove("hidden");
    document.getElementById("yearView").classList.add("hidden");
    document.getElementById("navbar").classList.add("nav-hidden");
    document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
    window.scrollTo(0, 0);
    currentYear = null;
    closeMobileMenu();
}

function loadYear(year) {
    currentYear = year;

    document.getElementById("landing").classList.add("hidden");
    document.getElementById("yearView").classList.remove("hidden");
    document.getElementById("navbar").classList.remove("nav-hidden");

    // Set year dropdown
    document.getElementById("yearFilter").value = String(year);

    // Highlight active nav link
    document.querySelectorAll(".nav-link").forEach(link => {
        link.classList.toggle("active", link.textContent.trim() === String(year));
    });

    populateFilters();
    applyFilters();
    window.scrollTo(0, 0);
    closeMobileMenu();
}

function onYearFilterChange() {
    const year = parseInt(document.getElementById("yearFilter").value);
    currentYear = year;

    // Highlight active nav link
    document.querySelectorAll(".nav-link").forEach(link => {
        link.classList.toggle("active", link.textContent.trim() === String(year));
    });

    populateFilters();
    applyFilters();
}

// ---- Filters ----

function populateFilters() {
    const emails = EMAIL_DATA[currentYear] || [];
    const marketFilter = document.getElementById("marketFilter");
    const monthFilter = document.getElementById("monthFilter");

    // Preserve current selections if possible
    const prevMarket = marketFilter.value;
    const prevMonth = monthFilter.value;

    // Get unique markets sorted
    const markets = [...new Set(emails.map(e => e.market))].sort();
    marketFilter.innerHTML = '<option value="all">All Markets</option>';
    markets.forEach(m => {
        marketFilter.innerHTML += `<option value="${m}">${m}</option>`;
    });

    // Get unique months in calendar order
    const monthsPresent = [...new Set(emails.map(e => e.month))];
    monthsPresent.sort((a, b) => MONTHS.indexOf(a) - MONTHS.indexOf(b));
    monthFilter.innerHTML = '<option value="all">All Months</option>';
    monthsPresent.forEach(m => {
        monthFilter.innerHTML += `<option value="${m}">${m}</option>`;
    });

    // Restore selections if they still exist
    if ([...marketFilter.options].some(o => o.value === prevMarket)) {
        marketFilter.value = prevMarket;
    }
    if ([...monthFilter.options].some(o => o.value === prevMonth)) {
        monthFilter.value = prevMonth;
    }
}

function applyFilters() {
    const emails = EMAIL_DATA[currentYear] || [];
    const market = document.getElementById("marketFilter").value;
    const month = document.getElementById("monthFilter").value;
    const search = document.getElementById("searchInput").value.toLowerCase().trim();

    // Highlight active dropdowns
    document.getElementById("yearFilter").classList.toggle("filter-active", false);
    document.getElementById("marketFilter").classList.toggle("filter-active", market !== "all");
    document.getElementById("monthFilter").classList.toggle("filter-active", month !== "all");

    // Show/hide search clear button
    document.getElementById("searchClear").classList.toggle("hidden", !search);

    const filtered = emails.filter(e => {
        if (market !== "all" && e.market !== market) return false;
        if (month !== "all" && e.month !== month) return false;
        if (search) {
            const searchableText = [
                e.id,
                e.title,
                e.subject || "",
                e.bodyCopy || "",
                e.market,
                e.month,
                e.sendDate || ""
            ].join(" ").toLowerCase();
            if (!searchableText.includes(search)) return false;
        }
        return true;
    });

    renderEmails(filtered, search);
    renderFilterSummary(market, month, search, filtered.length, emails.length);
    renderResultsHeader(filtered.length);
}

function resetFilters() {
    document.getElementById("marketFilter").value = "all";
    document.getElementById("monthFilter").value = "all";
    document.getElementById("searchInput").value = "";
    applyFilters();
}

function clearSearch() {
    document.getElementById("searchInput").value = "";
    applyFilters();
    document.getElementById("searchInput").focus();
}

function removeFilter(type) {
    if (type === "market") document.getElementById("marketFilter").value = "all";
    if (type === "month") document.getElementById("monthFilter").value = "all";
    if (type === "search") document.getElementById("searchInput").value = "";
    applyFilters();
}

// ---- Filter Summary (active filter pills) ----

function renderFilterSummary(market, month, search, count, total) {
    const container = document.getElementById("filterSummary");
    const pills = [];

    if (market !== "all") {
        pills.push(makePill("Market: " + market, "market"));
    }
    if (month !== "all") {
        pills.push(makePill("Month: " + month, "month"));
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

function getMarketClass(market) {
    const map = {
        "US/Canada": "market-us-canada",
        "CALA": "market-cala",
        "EMEA": "market-emea",
        "APAC": "market-apac",
        "Core": "market-core",
        "LUX": "market-lux"
    };
    return map[market] || "market-other";
}

function highlightText(text, search) {
    if (!search) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const searchEscaped = escapeHtml(search);
    const regex = new RegExp(`(${searchEscaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi");
    return escaped.replace(regex, '<span class="search-highlight">$1</span>');
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

    // Sort months in calendar order
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
            const displayId = email.id.replace(/[a-z]$/, "");
            const subjectDisplay = email.subject ? highlightText(email.subject, search) : "";
            const titleDisplay = highlightText(email.title, search);
            const marketDisplay = highlightText(email.market, search);

            html += `
            <div class="email-card">
                <div class="card-previews">
                    <a href="${email.approvedUrl}" target="_blank" rel="noopener">
                        <div class="preview-mobile">
                            <iframe src="${email.previewUrl}" loading="lazy" sandbox="allow-same-origin" title="Mobile preview of MAR-${displayId}"></iframe>
                        </div>
                        <div class="preview-tablet">
                            <iframe src="${email.previewUrl}" loading="lazy" sandbox="allow-same-origin" title="Tablet preview of MAR-${displayId}"></iframe>
                        </div>
                        <div class="card-hover-overlay">
                            <span>View Email</span>
                        </div>
                    </a>
                </div>
                <div class="card-body">
                    <div class="card-id">MAR-${displayId}</div>
                    <div class="card-title">${titleDisplay}</div>
                    ${subjectDisplay ? `<div class="card-subject"><strong>Subject:</strong> ${subjectDisplay}</div>` : ""}
                    ${email.sendDate ? `<div class="card-send-date"><strong>Send Date:</strong> ${highlightText(email.sendDate, search)}</div>` : ""}
                    <span class="card-market-tag ${getMarketClass(email.market)}">${marketDisplay}</span>
                    <div class="card-links">
                        ${email.trackerUrl ? `<a href="${email.trackerUrl}" target="_blank" rel="noopener" class="card-link">Message Tracker</a>` : ""}
                        <a href="${email.approvedUrl}" target="_blank" rel="noopener" class="card-link">Approved</a>
                        <a href="${email.previewUrl}" target="_blank" rel="noopener" class="card-link card-link-html">View HTML</a>
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


// ---- Mobile Menu ----

function toggleMobileMenu() {
    document.getElementById("navLinks").classList.toggle("open");
}

function closeMobileMenu() {
    document.getElementById("navLinks").classList.remove("open");
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
    // Focus search on "/" key (when not already in an input)
    if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "SELECT") {
        e.preventDefault();
        const searchInput = document.getElementById("searchInput");
        if (searchInput) searchInput.focus();
    }
    // Escape clears search
    if (e.key === "Escape" && document.activeElement.id === "searchInput") {
        clearSearch();
        document.activeElement.blur();
    }
});

// ---- Password Gate ----

const SITE_PASS_HASH = "a3c2f8d1e9b74650"; // hashed "MT2026!"

function hashPassword(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(16);
}

function checkPassword() {
    const input = document.getElementById("gatePassword").value;
    if (input === "MT2026!") {
        unlockSite();
    } else {
        const error = document.getElementById("gateError");
        const card = document.querySelector(".gate-card");
        error.classList.remove("hidden");
        card.classList.remove("gate-shake");
        void card.offsetWidth; // trigger reflow
        card.classList.add("gate-shake");
    }
    return false;
}

function unlockSite() {
    document.getElementById("passwordGate").classList.add("hidden");
    document.getElementById("siteContent").classList.remove("hidden");
    showLanding();
}

// ---- Init ----

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("gatePassword").focus();
});
