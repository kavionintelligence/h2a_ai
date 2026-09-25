import './brand-marks.css';

/** User-supplied artwork. Original image files are preserved, not recolored. */
export function BrandMark({ brand = 'byosync', className = '' }: { brand?: 'byosync' | 'h2a'; className?: string }) {
  return <span className={`brand-art brand-art-${brand} ${className}`}>
    <img data-brand={brand} src={`/brand-marks/${brand}.png`} alt={brand === 'byosync' ? 'ByoSync logo' : 'H2A logo'} width={brand === 'byosync' ? 500 : 1254} height={brand === 'byosync' ? 500 : 1254} decoding="async" />
  </span>;
}
