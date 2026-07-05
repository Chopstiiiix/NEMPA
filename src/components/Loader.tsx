import logo from '../assets/sparrow-logo.png';

/**
 * The Sparrowtell bird mark with a glimmer of light sweeping back and forth across
 * its surface. The logo PNG is used as a CSS mask, so the animated highlight
 * gradient is clipped to the bird silhouette (the eye stays a cutout).
 */
export function BirdLoader({ size = 92 }: { size?: number }) {
  return (
    <div
      className="bird-loader"
      role="status"
      aria-label="Loading"
      style={{ width: size, WebkitMaskImage: `url(${logo})`, maskImage: `url(${logo})` }}
    />
  );
}

/** Centered full-area page loader. */
export function PageLoader() {
  return (
    <div className="page-loader">
      <BirdLoader />
    </div>
  );
}
