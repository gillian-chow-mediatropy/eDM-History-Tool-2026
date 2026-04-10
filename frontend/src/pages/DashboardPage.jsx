function MetricCard({ icon, label, value, delta, tone = "up" }) {
    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
            <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-xl">
                {icon}
            </div>
            <div className="flex items-end justify-between mt-5">
                <div>
                    <span className="text-sm text-gray-500">{label}</span>
                    <h4 className="mt-2 text-5xl font-bold leading-none text-gray-800">{value}</h4>
                </div>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone === "up" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {delta}
                </span>
            </div>
        </div>
    );
}

export default function DashboardPage() {
    return (
        <div className="grid grid-cols-12 gap-4 md:gap-6">
            <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 md:gap-6">
                <MetricCard
                    label="Avg. Client Rating"
                    value="7.8/10"
                    delta="+20% Vs last month"
                    tone="up"
                    icon={(
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gray-800" aria-hidden="true">
                            <path d="M12 3L14.7 8.45L20.7 9.32L16.35 13.56L17.38 19.54L12 16.72L6.62 19.54L7.65 13.56L3.3 9.32L9.3 8.45L12 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                        </svg>
                    )}
                />
                <MetricCard
                    label="Instagram Followers"
                    value="5,934"
                    delta="-3.59% Vs last month"
                    tone="down"
                    icon={(
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gray-800" aria-hidden="true">
                            <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                            <circle cx="16" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M3.8 18.4C4.8 15.7 7 14.2 10 14.2C13 14.2 15.2 15.7 16.2 18.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    )}
                />
                <MetricCard
                    label="Total Revenue"
                    value="$9,758"
                    delta="+15% Vs last month"
                    tone="up"
                    icon={(
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gray-800" aria-hidden="true">
                            <path d="M12 3V21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            <path d="M16.5 7C16.5 5.7 15.2 4.7 13.5 4.7H10.5C8.8 4.7 7.5 5.7 7.5 7C7.5 8.3 8.8 9.3 10.5 9.3H13.5C15.2 9.3 16.5 10.3 16.5 11.6C16.5 12.9 15.2 13.9 13.5 13.9H10.5C8.8 13.9 7.5 12.9 7.5 11.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    )}
                />
            </div>

            <div className="col-span-12 xl:col-span-8 rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
                <div className="flex flex-col gap-5 mb-6 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800">Impression & Data Traffic</h3>
                        <p className="mt-1 text-sm text-gray-500">Jun 1, 2024 - Dec 1, 2025</p>
                    </div>
                    <div className="text-right">
                        <p className="text-5xl font-semibold text-gray-900">$9,758.00</p>
                        <p className="mt-1 text-sm font-semibold text-green-700">+7.96% Total Revenue</p>
                    </div>
                </div>

                <div className="relative mt-2 h-[310px] overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                    <div className="absolute inset-x-0 top-[22%] border-t border-gray-200" />
                    <div className="absolute inset-x-0 top-[45%] border-t border-gray-200" />
                    <div className="absolute inset-x-0 top-[68%] border-t border-gray-200" />
                    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 310" preserveAspectRatio="none" aria-hidden="true">
                        <path d="M0,178 C90,170 130,132 200,148 C280,166 320,191 390,172 C455,154 520,170 580,156 C650,140 700,92 760,110 C830,130 895,146 1000,144" fill="none" stroke="#ff8d6b" strokeWidth="3" />
                        <path d="M0,238 C95,230 130,248 200,240 C275,232 320,246 390,230 C450,216 500,178 580,164 C660,148 720,161 780,150 C850,136 900,102 1000,112" fill="none" stroke="#ffb39e" strokeWidth="3" />
                    </svg>
                </div>
            </div>

            <div className="col-span-12 xl:col-span-4 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                <h3 className="text-lg font-semibold text-gray-800">Traffic Stats</h3>

                <div className="mt-4 grid grid-cols-3 rounded-lg bg-gray-100 p-1">
                    <button className="rounded-md bg-white px-2 py-2 text-sm font-medium text-gray-900">Monthly</button>
                    <button className="rounded-md px-2 py-2 text-sm text-gray-500">Quarterly</button>
                    <button className="rounded-md px-2 py-2 text-sm text-gray-500">Annually</button>
                </div>

                <div className="mt-6">
                    <div className="pb-5 border-b border-gray-100">
                        <p className="text-sm text-gray-500">New Subscribers</p>
                        <p className="mt-1 text-4xl font-semibold text-gray-900">567K</p>
                        <p className="mt-1 text-sm font-semibold text-green-700">+3.85% then last Week</p>
                    </div>
                    <div className="py-5 border-b border-gray-100">
                        <p className="text-sm text-gray-500">Conversion Rate</p>
                        <p className="mt-1 text-4xl font-semibold text-gray-900">276K</p>
                        <p className="mt-1 text-sm font-semibold text-red-700">-5.39% then last Week</p>
                    </div>
                    <div className="pt-5">
                        <p className="text-sm text-gray-500">Page Bounce Rate</p>
                        <p className="mt-1 text-4xl font-semibold text-gray-900">145K</p>
                        <p className="mt-1 text-sm font-semibold text-green-700">+2.10% then last Week</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
