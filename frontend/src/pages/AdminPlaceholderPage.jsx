export default function AdminPlaceholderPage({ title, description }) {
    return (
        <div className="page">
            <div className="page-head">
                <h2>{title}</h2>
                <p>{description}</p>
            </div>

            <section className="card">
                <h3>{title}</h3>
                <p className="muted">
                    This admin module is prepared in the sidebar and routing structure. We can implement full fields,
                    database schema, and CRUD behavior in the next step.
                </p>
            </section>
        </div>
    );
}
