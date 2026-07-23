export default function PaymentDetailLoading() {
  return (
    <section
      className="record-page"
      aria-busy="true"
      aria-label="Loading payment"
    >
      <header className="record-topbar">
        <div>
          <span className="record-loading-line" />
          <span className="record-loading-title" />
        </div>
      </header>
      <div className="record-content">
        <div className="record-metrics record-metrics-loading">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </section>
  );
}
