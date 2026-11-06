import { useRef, useState, useEffect, useCallback } from "react";

// A titled horizontal row of cards. Scrolls natively (trackpad, touch, shift
// + wheel); the arrow buttons page by one visible width and disable at the
// ends so they never do nothing.
export default function PosterRow({ id, title, children }) {
  const trackRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update, children]);

  const page = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  const headingId = `row-${id}`;

  return (
    <section className="section poster-row" aria-labelledby={headingId}>
      <div className="section-head">
        <h2 className="section-title" id={headingId}>
          {title}
        </h2>
        <div className="poster-row-nav">
          <button
            type="button"
            className="row-arrow"
            onClick={() => page(-1)}
            disabled={!canPrev}
            aria-label={`Scroll ${title} back`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            className="row-arrow"
            onClick={() => page(1)}
            disabled={!canNext}
            aria-label={`Scroll ${title} forward`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
      <div className="poster-row-track" ref={trackRef}>
        {children}
      </div>
    </section>
  );
}
