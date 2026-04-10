import { useEffect, useMemo, useRef, useState } from "react";

function normalizeOption(option) {
    if (typeof option === "string" || typeof option === "number") {
        const value = String(option);
        return {
            value,
            label: value
        };
    }

    if (option && typeof option === "object") {
        const value = String(option.value ?? "");
        return {
            value,
            label: String(option.label ?? option.value ?? ""),
            searchText: String(option.searchText ?? option.label ?? option.value ?? "")
        };
    }

    return { value: "", label: "" };
}

export default function SearchSelect({
    id,
    value,
    onChange,
    options = [],
    placeholder = "Select option",
    isMulti = false,
    isDisabled = false,
    searchable = true,
    clearable = true,
    className = ""
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const rootRef = useRef(null);

    const normalizedOptions = useMemo(
        () => options.map(normalizeOption),
        [options]
    );

    const selectedValues = useMemo(() => {
        if (isMulti) {
            return Array.isArray(value)
                ? value.map((item) => String(item)).filter((item) => item.trim() !== "")
                : [];
        }
        if (value === undefined || value === null) return [];
        const singleValue = String(value);
        return singleValue.trim() === "" ? [] : [singleValue];
    }, [isMulti, value]);

    const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

    const selectedLabels = useMemo(() => {
        if (!selectedValues.length) return [];
        const map = new Map(normalizedOptions.map((option) => [option.value, option.label]));
        return selectedValues.map((selectedValue) => map.get(selectedValue) || selectedValue);
    }, [normalizedOptions, selectedValues]);

    const filteredOptions = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) return normalizedOptions;
        return normalizedOptions.filter((option) => {
            const text = `${option.label} ${option.searchText || ""}`.toLowerCase();
            return text.includes(keyword);
        });
    }, [normalizedOptions, query]);

    useEffect(() => {
        function onClickOutside(event) {
            if (rootRef.current && !rootRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, []);

    useEffect(() => {
        if (!isOpen) setQuery("");
    }, [isOpen]);

    function toggleOpen() {
        if (isDisabled) return;
        setIsOpen((current) => !current);
    }

    function handleSelect(nextValue) {
        if (isMulti) {
            const nextSet = new Set(selectedValues);
            if (nextSet.has(nextValue)) nextSet.delete(nextValue);
            else nextSet.add(nextValue);
            onChange(Array.from(nextSet));
            return;
        }
        onChange(nextValue);
        setIsOpen(false);
    }

    function clearSelection(event) {
        event.stopPropagation();
        if (isDisabled) return;
        onChange(isMulti ? [] : "");
    }

    const hasValue = selectedValues.length > 0;
    const displayText = hasValue ? selectedLabels.join(", ") : placeholder;

    return (
        <div className={`search-select ${className}`.trim()} ref={rootRef}>
            <button
                id={id}
                type="button"
                className={`search-select-trigger ${isDisabled ? "is-disabled" : ""}`}
                onClick={toggleOpen}
                disabled={isDisabled}
            >
                <span className={`search-select-value ${hasValue ? "is-value" : "is-placeholder"}`}>
                    {displayText}
                </span>
                <span className="search-select-actions">
                    {clearable && hasValue && (
                        <span
                            role="button"
                            tabIndex={-1}
                            className="search-select-clear"
                            onClick={clearSelection}
                        >
                            x
                        </span>
                    )}
                    <svg viewBox="0 0 20 20" fill="none" className="search-select-chevron">
                        <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </span>
            </button>

            {isOpen && (
                <div className="search-select-menu">
                    {searchable && (
                        <div className="search-select-search-wrap">
                            <input
                                type="text"
                                className="search-select-search"
                                placeholder="Search..."
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                autoFocus
                            />
                        </div>
                    )}

                    <div className="search-select-list">
                        {!filteredOptions.length && (
                            <p className="search-select-empty">No options found.</p>
                        )}
                        {filteredOptions.map((option) => {
                            const checked = selectedSet.has(option.value);
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    className={`search-select-option ${checked ? "is-selected" : ""}`}
                                    onClick={() => handleSelect(option.value)}
                                >
                                    <span className="search-select-option-label">{option.label}</span>
                                    {checked && (
                                        <svg viewBox="0 0 20 20" fill="none" className="search-select-check">
                                            <path d="M5 10.5L8.5 14L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
