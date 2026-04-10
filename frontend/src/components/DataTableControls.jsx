function buildPageWindow(currentPage, pageCount) {
    if (pageCount <= 7) {
        return Array.from({ length: pageCount }, (_, index) => index + 1);
    }
    if (currentPage <= 4) {
        return [1, 2, 3, 4, 5, "...", pageCount];
    }
    if (currentPage >= pageCount - 3) {
        return [1, "...", pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
    }
    return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", pageCount];
}

export default function DataTableControls({
    searchValue,
    onSearchChange,
    searchPlaceholder = "Search...",
    resultCount = 0,
    totalCount = 0
}) {
    return (
        <div className="data-table-tools">
            <div className="data-table-tools-top">
                <div className="data-table-search-wrap">
                    <input
                        className="data-table-search"
                        value={searchValue}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder={searchPlaceholder}
                    />
                </div>
                <p className="data-table-meta">
                    Showing {resultCount} of {totalCount}
                </p>
            </div>
        </div>
    );
}

export function DataTablePagination({
    page = 1,
    pageCount = 1,
    onPageChange
}) {
    if (pageCount <= 1) return null;

    const pages = buildPageWindow(page, pageCount);

    return (
        <div className="data-table-pager">
            <button
                type="button"
                className="data-table-page-btn"
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
            >
                Prev
            </button>
            {pages.map((entry, index) => (
                entry === "..."
                    ? (
                        <span key={`ellipsis-${index}`} className="data-table-page-ellipsis">...</span>
                    )
                    : (
                        <button
                            key={entry}
                            type="button"
                            className={`data-table-page-btn ${entry === page ? "active" : ""}`}
                            onClick={() => onPageChange(entry)}
                        >
                            {entry}
                        </button>
                    )
            ))}
            <button
                type="button"
                className="data-table-page-btn"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= pageCount}
            >
                Next
            </button>
        </div>
    );
}
