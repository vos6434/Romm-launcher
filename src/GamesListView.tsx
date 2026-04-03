import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CollectionRomsFilter } from "./collectionReleaseYears";
import { fetchRomsInCollection, type RomInCollection } from "./collectionRomsFetch";
import { rommAssetUrl } from "./rommAssets";
import type { RommCollection, Session } from "./CollectionsView";
import "./CollectionsView.css";

type Props = {
  session: Session;
  collection: RommCollection;
  onBack: () => void;
  onLogout: () => void;
};

function formatInvokeError(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function coverForRom(apiBase: string, g: RomInCollection): string | undefined {
  return (
    rommAssetUrl(apiBase, g.path_cover_large) ??
    rommAssetUrl(apiBase, g.path_cover_small) ??
    rommAssetUrl(apiBase, g.url_cover ?? undefined)
  );
}

function collectionAsFilter(c: RommCollection): CollectionRomsFilter {
  return c as unknown as CollectionRomsFilter;
}

export function GamesListView({
  session,
  collection,
  onBack,
  onLogout,
}: Props) {
  const [games, setGames] = useState<RomInCollection[]>([]);
  const [focusIndex, setFocusIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setFocusIndex(0);
      try {
        const list = await fetchRomsInCollection(
          session,
          collectionAsFilter(collection),
        );
        if (!cancelled) setGames(list);
      } catch (e) {
        if (!cancelled) setError(formatInvokeError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, collection]);

  const moveFocus = useCallback(
    (delta: number) => {
      if (games.length === 0) return;
      setFocusIndex((i) => {
        const n = games.length;
        return (i + delta + n) % n;
      });
    },
    [games.length],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        onBack();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveFocus(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        moveFocus(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveFocus, onBack]);

  useLayoutEffect(() => {
    const vp = viewportRef.current;
    const track = trackRef.current;
    const focusEl = focusRef.current;
    if (!vp || !track || !focusEl || loading || games.length === 0) {
      if (track) track.style.transform = "translateX(0)";
      return;
    }

    const align = () => {
      const vr = vp.getBoundingClientRect();
      const fr = focusEl.getBoundingClientRect();
      const dx = vr.left + vr.width / 2 - (fr.left + fr.width / 2);
      track.style.transform = `translateX(${dx}px)`;
    };

    align();
    const ro = new ResizeObserver(() => requestAnimationFrame(align));
    ro.observe(vp);
    ro.observe(track);
    return () => ro.disconnect();
  }, [focusIndex, games.length, loading]);

  const focused = games[focusIndex];
  const bgUrl = useMemo(
    () => (focused ? coverForRom(session.apiBase, focused) : undefined),
    [focused, session.apiBase],
  );

  const slots = useMemo(() => [-2, -1, 0, 1, 2], []);

  const subtitle = collection.description?.trim() || "Games in this collection";

  return (
    <div className="games-screen">
      <div
        className="collections-bg games-bg"
        style={
          bgUrl
            ? {
                backgroundImage: `url("${bgUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`,
              }
            : undefined
        }
      />
      <div className="collections-bg-scrim" />

      <header className="collections-header games-header">
        <h1 className="collections-title games-collection-title">
          {collection.name}
        </h1>
        <p className="collections-subtitle">{subtitle}</p>
      </header>

      {loading ? (
        <p className="collections-status">Loading games…</p>
      ) : null}
      {error ? (
        <p className="collections-error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error && games.length === 0 ? (
        <p className="collections-status">No games in this collection.</p>
      ) : null}

      {!loading && games.length > 0 ? (
        <div
          className="collections-carousel-viewport games-viewport"
          ref={viewportRef}
        >
            <div
              className="games-track games-track--pan"
              ref={trackRef}
              role="list"
              aria-label="Games in collection"
            >
              <div className="games-poster-stage">
                <div className="games-row games-row--posters">
                  {slots.map((offset) => {
                    const idx = focusIndex + offset;
                    const g = games[idx];
                    const isFocus = offset === 0;
                    const empty = idx < 0 || idx >= games.length;

                    if (empty) {
                      return (
                        <div
                          key={`p-${offset}`}
                          className="games-slot-cell games-slot-cell--empty"
                          aria-hidden
                        >
                          <div className="collection-poster collection-poster--empty" />
                        </div>
                      );
                    }

                    const cover = coverForRom(session.apiBase, g);
                    return (
                      <button
                        key={`p-${g.id}-${idx}`}
                        ref={isFocus ? focusRef : undefined}
                        type="button"
                        role="listitem"
                        className={`collection-slot games-poster-slot${isFocus ? " collection-slot--focus" : ""}`}
                        onClick={() => setFocusIndex(idx)}
                      >
                        <div
                          className={`collection-poster${isFocus ? " collection-poster--focus" : ""}`}
                        >
                          {cover ? (
                            <img src={cover} alt="" loading="lazy" />
                          ) : (
                            <span className="collection-poster-fallback">
                              {g.name}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="games-timeline-block">
                <div className="games-timeline-line-track" aria-hidden>
                  <div className="games-timeline-line" />
                </div>
                <div className="games-row games-row--timeline">
                  {slots.map((offset) => {
                    const idx = focusIndex + offset;
                    const g = games[idx];
                    const isFocus = offset === 0;
                    const empty = idx < 0 || idx >= games.length;

                    return (
                      <div
                        key={`t-${offset}`}
                        className={`games-slot-cell games-timeline-cell${isFocus ? " games-timeline-cell--focus" : ""}${empty ? " games-timeline-cell--empty" : ""}`}
                      >
                        <div className="games-timeline-marker-row" aria-hidden>
                          {empty ? (
                            <span className="games-timeline-tick games-timeline-tick--empty" />
                          ) : isFocus ? (
                            <span className="games-timeline-dot" />
                          ) : (
                            <span className="games-timeline-tick" />
                          )}
                        </div>
                        {!empty ? (
                          <>
                            <span className="games-timeline-year">{g.displayYear}</span>
                            <span className="games-timeline-title">{g.name}</span>
                          </>
                        ) : (
                          <>
                            <span className="games-timeline-year games-timeline-year--empty">
                              {" "}
                            </span>
                            <span className="games-timeline-title games-timeline-title--empty">
                              {" "}
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
      ) : null}

      <footer className="collections-footer">
        <div className="footer-hint">
          <span className="footer-keys" aria-hidden>
            <kbd>←</kbd>
            <kbd>→</kbd>
          </span>
          <span>Move</span>
        </div>
        <div className="footer-hint">
          <span className="footer-btn footer-btn--a" aria-hidden>
            A
          </span>
          <span>Select</span>
        </div>
        <div className="footer-hint">
          <span className="footer-btn footer-btn--x" aria-hidden>
            X
          </span>
          <span>Launch</span>
        </div>
      </footer>

      <button type="button" className="collections-logout" onClick={onBack}>
        <span className="footer-btn footer-btn--b" aria-hidden>
          B
        </span>
        Back to collections
      </button>

      <button type="button" className="games-logout-alt" onClick={onLogout}>
        Back to login
      </button>
    </div>
  );
}
