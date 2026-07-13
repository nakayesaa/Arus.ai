import { PageHeader } from './page-header';

interface PlaceholderPageProps {
  eyebrow: string;
  title: string;
  description: string;
}

export function PlaceholderPage({
  eyebrow,
  title,
  description,
}: PlaceholderPageProps) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <section className="empty-state">
        <h2>Foundation ready</h2>
        <p className="muted">
          Halaman ini sudah berada di navigation shell dan akan diaktifkan
          sesuai critical path P0.
        </p>
      </section>
    </>
  );
}
